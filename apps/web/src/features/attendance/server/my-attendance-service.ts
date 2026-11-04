import type { PrismaClient } from '@chulgeunkok/db';

import { payPeriodConfigOf, summarizePeriod } from '@/features/payroll/model/work-time';
import { loadPeriodAttendances, resolvePeriod } from '@/features/payroll/server/period-attendances';
import { requireMembership } from '@/server/auth/require-membership';

import type { MyAttendancesDto } from '../model/my-attendance-types';

import { toRowDto } from './attendance-admin-service';

/**
 * GET /attendance/me — 직원 본인 기록과 이번 기간 예상 기본급 (docs/specs/attendance §8, payroll §4)
 * 근무 중 카드·대기 중 수정 요청 표시를 위해 한 번에 돌려준다.
 */
export async function getMyAttendances(
  db: PrismaClient,
  input: { userId: string; storeId: string; periodStart?: string; now: Date },
): Promise<MyAttendancesDto> {
  const member = await requireMembership({ storeId: input.storeId, userId: input.userId, action: 'MEMBER' }, db);
  const store = await db.store.findUniqueOrThrow({ where: { id: input.storeId } });
  const period = resolvePeriod({ periodStart: input.periodStart, payPeriod: payPeriodConfigOf(store), now: input.now });
  const [rows, pending, open] = await Promise.all([
    loadPeriodAttendances(db, { storeId: input.storeId, period, memberId: member.id }),
    db.correctionRequest.findMany({
      where: { status: 'PENDING', attendance: { membershipId: member.id } },
      select: { attendanceId: true, type: true },
    }),
    db.attendance.findFirst({ where: { membershipId: member.id, status: 'OPEN' } }),
  ]);

  const closed = rows.filter((row) => row.attendance.status === 'CLOSED');
  const summary = summarizePeriod(closed.flatMap((row) => row.segments), period);
  const pendingByAttendance = new Map(pending.map((request) => [request.attendanceId, request.type]));
  return {
    store: { id: store.id, name: store.name },
    period,
    working: open ? { attendanceId: open.id, clockInAt: open.clockInAt.toISOString() } : null,
    summary: {
      recognizedSeconds: summary.recognizedSeconds,
      basePayEstimate: summary.basePayEstimate,
      workDays: new Set(closed.map((row) => row.localDate)).size,
    },
    rows: rows.map((row) => ({ ...toRowDto(row), pendingCorrection: pendingByAttendance.get(row.attendance.id) ?? null })),
  };
}
