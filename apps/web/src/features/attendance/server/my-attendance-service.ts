import type { PrismaClient } from '@chulgeunkok/db';

import { payPeriodConfigOf, summarizePeriod, toLocalDate } from '@/features/payroll/model/work-time';
import { loadPeriodWithAllowances } from '@/features/payroll/server/allowance-service';
import { resolvePeriod } from '@/features/payroll/server/period-attendances';
import { requireMembership } from '@/server/auth/require-membership';

import type { MyAttendancesDto } from '../model/my-attendance-types';

import { toRowDto } from './attendance-admin-service';

/**
 * GET /attendance/me — 직원 본인 기록과 이번 기간 예상 기본급·주휴·가산·유급휴일수당 (docs/specs/attendance §8, payroll §4)
 * 근무 중 카드·대기 중 수정 요청 표시를 위해 한 번에 돌려준다.
 */
export async function getMyAttendances(
  db: PrismaClient,
  input: { userId: string; storeId: string; periodStart?: string; now: Date },
): Promise<MyAttendancesDto> {
  const member = await requireMembership({ storeId: input.storeId, userId: input.userId, action: 'MEMBER' }, db);
  const store = await db.store.findUniqueOrThrow({ where: { id: input.storeId } });
  const period = resolvePeriod({ periodStart: input.periodStart, payPeriod: payPeriodConfigOf(store), now: input.now });
  const [{ rows, allowancesFor }, pending, open] = await Promise.all([
    loadPeriodWithAllowances(db, { storeId: input.storeId, period, today: toLocalDate(input.now), memberId: member.id }),
    db.correctionRequest.findMany({
      where: { status: 'PENDING', attendance: { membershipId: member.id } },
      select: { attendanceId: true, type: true },
    }),
    db.attendance.findFirst({
      where: { membershipId: member.id, status: 'OPEN' },
      include: { breaks: { where: { endAt: null } } },
    }),
  ]);

  const closed = rows.filter((row) => row.attendance.status === 'CLOSED');
  const summary = summarizePeriod(closed.flatMap((row) => row.segments), period);
  const pendingByAttendance = new Map(pending.map((request) => [request.attendanceId, request.type]));
  return {
    store: { id: store.id, name: store.name },
    period,
    serverNow: input.now.toISOString(),
    working: open
      ? {
          attendanceId: open.id,
          clockInAt: open.clockInAt.toISOString(),
          breakStartedAt: open.breaks[0]?.startAt.toISOString() ?? null,
        }
      : null,
    summary: {
      recognizedSeconds: summary.recognizedSeconds,
      basePayEstimate: summary.basePayEstimate,
      allowances: allowancesFor(member.id),
      workDays: new Set(closed.map((row) => row.localDate)).size,
    },
    rows: rows.map((row) => ({ ...toRowDto(row), pendingCorrection: pendingByAttendance.get(row.attendance.id) ?? null })),
  };
}
