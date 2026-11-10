import type { HeadcountBand, PrismaClient, StoreHeadcountDeclaration } from '@chulgeunkok/db';

import { weekStartOf } from '@/features/labor/model/work-record-rules';
import { OPEN_REVIEW_STATUSES } from '@/features/labor/server/review-service';
import { requireMembership } from '@/server/auth/require-membership';

import { estimateAllowances, type AllowanceEstimate, type AllowanceTerms } from '../model/allowances';
import type { PayrollMemberDto, PayrollPreviewDto } from '../model/payroll-types';
import { payPeriodConfigOf, summarizePeriod, toLocalDate, type PayPeriod } from '../model/work-time';

import { loadPeriodAttendances, resolvePeriod, restrictToPeriod, type PeriodAttendanceRow } from './period-attendances';

export interface PayrollPreviewWithRows {
  preview: PayrollPreviewDto;
  rows: PeriodAttendanceRow[];
  storeName: string;
  /** CSV용 휴대폰 뒤 4자리 (없으면 빈 문자열) */
  phoneLast4ByMember: Map<string, string>;
}

const countBy = (keys: string[]) =>
  keys.reduce((counts, key) => counts.set(key, (counts.get(key) ?? 0) + 1), new Map<string, number>());

/** 그날 기준 사업장 규모 신고값 (신고는 effectiveFrom 오름차순) */
const bandOn = (declarations: readonly StoreHeadcountDeclaration[], localDate: string): HeadcountBand =>
  declarations.filter((declaration) => declaration.effectiveFrom.toISOString().slice(0, 10) <= localDate).at(-1)?.band ??
  'UNKNOWN';

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
  // 주휴·주 40시간은 기간 첫 주 월요일부터 봐야 한다 (docs/specs/payroll §3.6)
  const weekRows = await loadPeriodAttendances(db, {
    storeId: input.storeId,
    period: { start: weekStartOf(period.start), end: period.end },
  });
  const rows = restrictToPeriod(weekRows, period);

  const workedMemberIds = new Set(rows.map((row) => row.attendance.membershipId));
  const [members, pendingCorrections, openReviews, declarations] = await Promise.all([
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
    db.storeHeadcountDeclaration.findMany({ where: { storeId: input.storeId }, orderBy: { effectiveFrom: 'asc' } }),
  ]);
  const termsByMember = await loadTermsByMember(db, members.map((member) => member.id));
  const today = toLocalDate(input.now);
  const estimateFor = (memberId: string) =>
    estimateMemberAllowances({
      period,
      today,
      terms: termsByMember.get(memberId) ?? [],
      rows: weekRows.filter((row) => row.attendance.membershipId === memberId),
      isFiveOrMore: (localDate) => bandOn(declarations, localDate) === 'FIVE_OR_MORE',
    });

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
        allowances: estimateFor(member.id),
      }),
    )
    .sort((a, b) => b.recognizedSeconds - a.recognizedSeconds || a.name.localeCompare(b.name, 'ko'));

  const lastDay = toLocalDate(new Date(Date.parse(`${period.end}T00:00:00+09:00`) - 1));
  return {
    preview: {
      period,
      headcountBand: bandOn(declarations, lastDay < today ? lastDay : today),
      totals: {
        recognizedSeconds: memberDtos.reduce((sum, member) => sum + member.recognizedSeconds, 0),
        basePayEstimate: memberDtos.reduce((sum, member) => sum + member.basePayEstimate, 0),
        allowanceEstimate: memberDtos.reduce((sum, member) => sum + member.allowances.total, 0),
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
  allowances: AllowanceEstimate;
}): PayrollMemberDto {
  const closed = input.rows.filter((row) => row.attendance.status === 'CLOSED');
  const summary = summarizePeriod(closed.flatMap((row) => row.segments), input.period);
  const countStatus = (status: string) => input.rows.filter((row) => row.attendance.status === status).length;
  return {
    memberId: input.member.id,
    name: input.member.name,
    status: input.member.status,
    ...summary,
    allowances: input.allowances,
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

async function loadTermsByMember(db: PrismaClient, memberIds: string[]): Promise<Map<string, AllowanceTerms[]>> {
  const terms = await db.employmentTerms.findMany({
    where: { membershipId: { in: memberIds } },
    include: { schedules: true },
  });
  const byMember = new Map<string, AllowanceTerms[]>();
  for (const version of terms) byMember.set(version.membershipId, [...(byMember.get(version.membershipId) ?? []), version]);
  return byMember;
}

/** 직원 1명 예상 주휴·가산수당. rows 는 기간 첫 주 월요일부터 */
function estimateMemberAllowances(input: {
  period: PayPeriod;
  today: string;
  terms: AllowanceTerms[];
  rows: PeriodAttendanceRow[];
  isFiveOrMore: (localDate: string) => boolean;
}): AllowanceEstimate {
  const works = input.rows.flatMap(({ attendance, segments }) =>
    attendance.status === 'CLOSED' && attendance.clockOutAt
      ? [{ clockInAt: attendance.clockInAt, clockOutAt: attendance.clockOutAt, segments, terms: attendance.terms }]
      : [],
  );
  return estimateAllowances({
    ...input,
    attendedDates: new Set(input.rows.filter((row) => row.attendance.status !== 'VOID').map((row) => row.localDate)),
    works,
  });
}
