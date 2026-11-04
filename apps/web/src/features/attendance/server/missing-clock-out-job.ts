import type { PrismaClient } from '@chulgeunkok/db';

import { missingClockOutDeadline } from '@/features/labor/model/work-record-rules';
import { localWeekday } from '@/features/payroll/model/work-time';

/** 자동 처리 actor. 0002 마이그레이션이 시드한다 */
export const SYSTEM_USER_ID = 'system';
export const AUTO_MISSING_CLOCK_OUT_REASON = 'AUTO_MISSING_CLOCK_OUT';

/**
 * 10분 주기: 기준 시각이 지난 근무 중 기록을 퇴근 누락으로 바꾼다 (docs/specs/attendance §5.1).
 * 직원이 그 사이 퇴근을 찍었으면 조건부 update가 0건이라 건너뛴다.
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
      const updated = await tx.attendance.updateMany({
        where: { id: attendance.id, status: 'OPEN' },
        data: { status: 'MISSING_CLOCK_OUT' },
      });
      if (updated.count === 0) return false;
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
