import type { HeadcountBand, PrismaClient } from '@chulgeunkok/db';

import { weekStartOf } from '@/features/labor/model/work-record-rules';

import { estimateAllowances, type AllowanceEstimate, type AllowanceTerms } from '../model/allowances';
import type { PayPeriod } from '../model/work-time';

import { loadPeriodAttendances, restrictToPeriod, type PeriodAttendanceRow } from './period-attendances';

export interface PeriodWithAllowances {
  /** 기간 안 근태. `loadPeriodAttendances` 결과와 같다 */
  rows: PeriodAttendanceRow[];
  /** 직원 1명 예상 주휴·가산수당 (docs/specs/payroll §3.6) */
  allowancesFor: (memberId: string) => AllowanceEstimate;
  /** 그날 기준 사업장 규모 신고값 */
  bandOn: (localDate: string) => HeadcountBand;
  /** 기간 첫 주 월요일부터 근태가 있는 직원. 주휴·가산이 생길 수 있는 직원은 여기 다 있다 */
  workedMemberIds: string[];
}

/**
 * 기간 근태와 예상 주휴·가산수당. 정산 미리보기·직원 본인·대시보드가 같이 쓴다.
 * 주휴·주 40시간은 기간 첫 주 월요일부터 봐야 해서 그만큼 넓게 한 번 읽고 기간으로 좁힌다.
 */
export async function loadPeriodWithAllowances(
  db: PrismaClient,
  input: { storeId: string; period: PayPeriod; today: string; memberId?: string },
): Promise<PeriodWithAllowances> {
  const membershipFilter = input.memberId ? { membershipId: input.memberId } : { membership: { storeId: input.storeId } };
  const [weekRows, declarations, terms] = await Promise.all([
    loadPeriodAttendances(db, {
      storeId: input.storeId,
      period: { start: weekStartOf(input.period.start), end: input.period.end },
      memberId: input.memberId,
    }),
    db.storeHeadcountDeclaration.findMany({ where: { storeId: input.storeId }, orderBy: { effectiveFrom: 'asc' } }),
    db.employmentTerms.findMany({ where: membershipFilter, include: { schedules: true } }),
  ]);

  const bandOn = (localDate: string): HeadcountBand =>
    declarations.filter((declaration) => declaration.effectiveFrom.toISOString().slice(0, 10) <= localDate).at(-1)
      ?.band ?? 'UNKNOWN';
  const allowancesFor = (memberId: string) =>
    estimateMemberAllowances({
      period: input.period,
      today: input.today,
      terms: terms.filter((version) => version.membershipId === memberId),
      rows: weekRows.filter((row) => row.attendance.membershipId === memberId),
      isFiveOrMore: (localDate) => bandOn(localDate) === 'FIVE_OR_MORE',
    });
  return {
    rows: restrictToPeriod(weekRows, input.period),
    allowancesFor,
    bandOn,
    workedMemberIds: [...new Set(weekRows.map((row) => row.attendance.membershipId))],
  };
}

/** rows 는 기간 첫 주 월요일부터 */
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
