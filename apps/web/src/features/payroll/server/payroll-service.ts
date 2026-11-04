import type { PrismaClient } from '@chulgeunkok/db';

import { OPEN_REVIEW_STATUSES } from '@/features/labor/server/review-service';
import { requireMembership } from '@/server/auth/require-membership';

import type { PayrollMemberDto, PayrollPreviewDto } from '../model/payroll-types';
import { payPeriodConfigOf, summarizePeriod } from '../model/work-time';

import { loadPeriodAttendances, resolvePeriod, type PeriodAttendanceRow } from './period-attendances';

export interface PayrollPreviewWithRows {
  preview: PayrollPreviewDto;
  rows: PeriodAttendanceRow[];
  storeName: string;
  /** CSV용 휴대폰 뒤 4자리 (없으면 빈 문자열) */
  phoneLast4ByMember: Map<string, string>;
}

const countBy = (keys: string[]) =>
  keys.reduce((counts, key) => counts.set(key, (counts.get(key) ?? 0) + 1), new Map<string, number>());

/** GET /stores/:storeId/payroll/preview — docs/specs/payroll §4 */
export async function getPayrollPreview(
  db: PrismaClient,
  input: { storeId: string; actorUserId: string; periodStart?: string; now: Date },
): Promise<PayrollPreviewDto> {
  return (await loadPayroll(db, input)).preview;
}

/** 미리보기와 CSV가 같은 데이터를 쓴다 */
export async function loadPayroll(
  db: PrismaClient,
  input: { storeId: string; actorUserId: string; periodStart?: string; now: Date },
): Promise<PayrollPreviewWithRows> {
  await requireMembership({ storeId: input.storeId, userId: input.actorUserId, action: 'PAYROLL' }, db);
  const store = await db.store.findUniqueOrThrow({ where: { id: input.storeId } });
  const period = resolvePeriod({ periodStart: input.periodStart, payPeriod: payPeriodConfigOf(store), now: input.now });
  const rows = await loadPeriodAttendances(db, { storeId: input.storeId, period });

  const workedMemberIds = new Set(rows.map((row) => row.attendance.membershipId));
  const [members, pendingCorrections, openReviews] = await Promise.all([
    // 대상: 기간 중 근무가 있거나 지금 재직 중인 직원. 사장님은 근무했을 때만
    db.membership.findMany({
      where: {
        storeId: input.storeId,
        OR: [{ id: { in: [...workedMemberIds] } }, { status: 'ACTIVE', role: { not: 'OWNER' } }],
      },
      include: { user: true },
    }),
    db.correctionRequest.findMany({
      where: { status: 'PENDING', attendance: { storeId: input.storeId } },
      select: { attendance: { select: { membershipId: true } } },
    }),
    db.laborReview.findMany({
      where: { membership: { storeId: input.storeId }, status: { in: [...OPEN_REVIEW_STATUSES] } },
      select: { membershipId: true },
    }),
  ]);

  const correctionCounts = countBy(pendingCorrections.map((request) => request.attendance.membershipId));
  const reviewCounts = countBy(openReviews.map((review) => review.membershipId));
  const memberDtos = members
    .map((member) =>
      toMemberDto({
        member: { id: member.id, name: member.user.name, status: member.status },
        rows: rows.filter((row) => row.attendance.membershipId === member.id),
        period,
        pendingCorrectionCount: correctionCounts.get(member.id) ?? 0,
        openLaborReviewCount: reviewCounts.get(member.id) ?? 0,
      }),
    )
    .sort((a, b) => b.recognizedSeconds - a.recognizedSeconds || a.name.localeCompare(b.name, 'ko'));

  return {
    preview: {
      period,
      totals: {
        recognizedSeconds: memberDtos.reduce((sum, member) => sum + member.recognizedSeconds, 0),
        basePayEstimate: memberDtos.reduce((sum, member) => sum + member.basePayEstimate, 0),
        memberCount: memberDtos.filter((member) => member.recognizedSeconds > 0).length,
      },
      members: memberDtos,
      unresolved: {
        missingClockOut: memberDtos.reduce((sum, member) => sum + member.flags.missingClockOutCount, 0),
        pendingCorrections: pendingCorrections.length,
        openLaborReviews: openReviews.length,
      },
    },
    rows,
    storeName: store.name,
    phoneLast4ByMember: new Map(members.map((member) => [member.id, member.user.phone?.slice(-4) ?? ''])),
  };
}

function toMemberDto(input: {
  member: { id: string; name: string; status: 'ACTIVE' | 'INACTIVE' };
  rows: PeriodAttendanceRow[];
  period: { start: string; end: string };
  pendingCorrectionCount: number;
  openLaborReviewCount: number;
}): PayrollMemberDto {
  const closed = input.rows.filter((row) => row.attendance.status === 'CLOSED');
  const summary = summarizePeriod(closed.flatMap((row) => row.segments), input.period);
  const countStatus = (status: string) => input.rows.filter((row) => row.attendance.status === status).length;
  return {
    memberId: input.member.id,
    name: input.member.name,
    status: input.member.status,
    ...summary,
    attendanceCount: closed.length,
    workDays: new Set(closed.map((row) => row.localDate)).size,
    flags: {
      openCount: countStatus('OPEN'),
      missingClockOutCount: countStatus('MISSING_CLOCK_OUT'),
      pendingCorrectionCount: input.pendingCorrectionCount,
      breakNotScheduledCount: closed.filter((row) => row.breakNotScheduled).length,
      openLaborReviewCount: input.openLaborReviewCount,
    },
  };
}
