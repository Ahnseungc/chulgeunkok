import type { PrismaClient } from '@chulgeunkok/db';

import { missingClockOutDeadline } from '@/features/labor/model/work-record-rules';
import { localWeekday } from '@/features/payroll/model/work-time';

import { closeOpenBreak } from './break-service';
import { lockMembership } from './punch-context';

/** 자동 처리 actor. 0002 마이그레이션이 시드한다 */
export const SYSTEM_USER_ID = 'system';
export const AUTO_MISSING_CLOCK_OUT_REASON = 'AUTO_MISSING_CLOCK_OUT';

/**
 * 10분 주기: 기준 시각이 지난 근무 중 기록을 퇴근 누락으로 바꾼다 (docs/specs/attendance §5.1).
 * 직원이 그 사이 퇴근을 찍었으면 조건부 update가 0건이라 건너뛴다. 열린 휴게도 같이 닫는다.
 */
export async function runMissingClockOutJob(db: PrismaClient, now: Date): Promise<{ checked: number; transitioned: number }> {
  const open = await db.attendance.findMany({
    where: { status: 'OPEN' },
    include: { terms: { include: { schedules: true } } },
  });

  let transitioned = 0;
  for (const attendance of open) {
    const weekday = localWeekday(attendance.clockInAt);
    const schedule = attendance.terms.scheduleVaries
      ? undefined
      : attendance.terms.schedules.find((candidate) => candidate.weekday === weekday);
    if (now < missingClockOutDeadline(attendance.clockInAt, schedule)) continue;

    const changed = await db.$transaction(async (tx) => {
      // 같은 직원의 퇴근·휴게 요청과 직렬화한다 (열린 휴게가 남지 않게)
      await lockMembership(tx, attendance.membershipId);
      const updated = await tx.attendance.updateMany({
        where: { id: attendance.id, status: 'OPEN' },
        data: { status: 'MISSING_CLOCK_OUT' },
      });
      if (updated.count === 0) return false;
      // 휴게 중에 퇴근을 잊었으면 전환 시각으로 닫는다. 퇴근 시각을 넣으면 정산은 근무 안 부분만 뺀다 (§3.6)
      await closeOpenBreak(tx, { attendanceId: attendance.id, at: now });
      await tx.attendanceRevision.create({
        data: {
          attendanceId: attendance.id,
          actorId: SYSTEM_USER_ID,
          reason: AUTO_MISSING_CLOCK_OUT_REASON,
          before: { clockInAt: attendance.clockInAt.toISOString(), clockOutAt: null, status: 'OPEN', breakWaived: attendance.breakWaived },
          after: { clockInAt: attendance.clockInAt.toISOString(), clockOutAt: null, status: 'MISSING_CLOCK_OUT', breakWaived: attendance.breakWaived },
        },
      });
      return true;
    });
    if (changed) transitioned += 1;
  }
  return { checked: open.length, transitioned };
}
