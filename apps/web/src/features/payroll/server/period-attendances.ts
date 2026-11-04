import type { Attendance, DbClient, EmploymentTerms, EmploymentTermsSchedule, Membership, User } from '@chulgeunkok/db';

import { ApiError } from '@/server/http/api-error';

import {
  getStorePayPeriod,
  localMidnight,
  toLocalDate,
  toSegments,
  type PayPeriod,
  type PayPeriodConfig,
  type PeriodWithNav,
  type WorkSegment,
} from '../model/work-time';

/** 기간 시작 직전에 출근해 자정을 넘긴 근무도 포함하려고 하루 앞부터 읽는다 */
const DAY_MS = 24 * 60 * 60 * 1000;

export type PeriodAttendance = Attendance & {
  membership: Membership & { user: User };
  terms: EmploymentTerms & { schedules: EmploymentTermsSchedule[] };
  _count: { revisions: number };
};

export interface PeriodAttendanceRow {
  attendance: PeriodAttendance;
  /** 출근 날짜 (매장 시간대) */
  localDate: string;
  /** CLOSED 근무의 이 기간 안 구간. 근무 중·누락·무효는 빈 배열 */
  segments: WorkSegment[];
  breakNotScheduled: boolean;
}

/**
 * periodStart가 없으면 오늘이 속한 기간. 주어지면 실제 기간 시작일이어야 한다.
 * docs/specs/payroll §3.1·§8
 */
export function resolvePeriod(input: { periodStart?: string; payPeriod: PayPeriodConfig; now: Date }): PeriodWithNav {
  const today = toLocalDate(input.now);
  const period = getStorePayPeriod(input.periodStart ?? today, input.payPeriod);
  if (input.periodStart && period.start !== input.periodStart) throw new ApiError('PAY_PERIOD_INVALID');
  if (period.start > today) throw new ApiError('PAY_PERIOD_IN_FUTURE');
  const dayBefore = new Date(Date.parse(`${period.start}T00:00:00Z`) - DAY_MS).toISOString().slice(0, 10);
  return {
    ...period,
    prevStart: getStorePayPeriod(dayBefore, input.payPeriod).start,
    nextStart: period.end > today ? null : period.end,
  };
}

/**
 * 기간에 걸친 근태와 구간. 정산 미리보기·CSV·근태 목록·대시보드가 같은 계산을 쓴다.
 * 기간 안 날짜에 출근했거나, 기간 안에 구간이 있는 근태만 남긴다.
 */
export async function loadPeriodAttendances(
  db: DbClient,
  input: { storeId: string; period: PayPeriod; memberId?: string },
): Promise<PeriodAttendanceRow[]> {
  const attendances = await db.attendance.findMany({
    where: {
      storeId: input.storeId,
      ...(input.memberId ? { membershipId: input.memberId } : {}),
      clockInAt: {
        gte: new Date(localMidnight(input.period.start).getTime() - DAY_MS),
        lt: localMidnight(input.period.end),
      },
    },
    include: {
      membership: { include: { user: true } },
      terms: { include: { schedules: true } },
      _count: { select: { revisions: true } },
    },
    orderBy: { clockInAt: 'desc' },
  });

  return attendances
    .map((attendance) => toRow(attendance, input.period))
    .filter(
      (row) =>
        (row.localDate >= input.period.start && row.localDate < input.period.end) || row.segments.length > 0,
    );
}

function toRow(attendance: PeriodAttendance, period: PayPeriod): PeriodAttendanceRow {
  const localDate = toLocalDate(attendance.clockInAt);
  if (attendance.status !== 'CLOSED' || !attendance.clockOutAt) {
    return { attendance, localDate, segments: [], breakNotScheduled: false };
  }
  const { segments, breakNotScheduled } = toSegments({
    attendance: { ...attendance, clockOutAt: attendance.clockOutAt },
    terms: attendance.terms,
  });
  return {
    attendance,
    localDate,
    segments: segments.filter((segment) => segment.localDate >= period.start && segment.localDate < period.end),
    breakNotScheduled,
  };
}
