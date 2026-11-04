/**
 * 근로조건 검토 규칙 (순수 함수). docs/specs/labor §3.3·§4
 * 법적 판단이 아니라 "검토가 필요한 항목"을 고른다. 기준값은 노무사 검증 전 설계 가정 (인덱스 Q6).
 */

/** 주휴수당 검토 기준: 주 소정근로 15시간 */
export const WEEKLY_HOLIDAY_MIN_WEEKLY_MINUTES = 15 * 60;
/** 단시간근로자 판단: 주 40시간 미만 (MVP 가정) */
export const FULL_TIME_WEEKLY_MINUTES = 40 * 60;
/** 근기법 §54: 근로 4시간 → 휴게 30분, 8시간 → 1시간 */
const BREAK_REQUIREMENTS = [
  { minLaborMinutes: 8 * 60, breakMinutes: 60 },
  { minLaborMinutes: 4 * 60, breakMinutes: 30 },
] as const;

export interface ScheduleRule {
  weekday: number;
  workMinutes: number;
  breakMinutes: number;
}

export interface TermsRuleInput {
  hourlyWage: number;
  schedules: readonly ScheduleRule[];
  scheduleVaries: boolean;
  averageWeeklyMinutesOverride: number | null;
  weeklyHolidayWeekday: number | null;
}

export type TermsReviewType =
  | 'MINIMUM_WAGE'
  | 'BREAK_SHORTAGE'
  | 'WEEKLY_HOLIDAY'
  | 'SHORT_TIME_OVERTIME';

export interface TermsReviewFinding {
  type: TermsReviewType;
  reasonCode: string;
  status: 'OPEN' | 'NEEDS_INFORMATION';
}

/** 하루 근로시간 = 구간 길이 − 휴게 */
export const dailyLaborMinutes = (schedule: ScheduleRule) =>
  schedule.workMinutes - schedule.breakMinutes;

export function weeklyContractMinutes(terms: TermsRuleInput): number {
  if (terms.scheduleVaries) return terms.averageWeeklyMinutesOverride ?? 0;
  return terms.schedules.reduce((sum, schedule) => sum + dailyLaborMinutes(schedule), 0);
}

export function requiredBreakMinutes(laborMinutes: number): number {
  return BREAK_REQUIREMENTS.find((rule) => laborMinutes >= rule.minLaborMinutes)?.breakMinutes ?? 0;
}

/** 근로조건 하나에서 나오는 검토 항목. 순서는 안내 우선순위 */
export function evaluateTermsReviews(
  terms: TermsRuleInput,
  rule: { minimumHourlyWage: number },
): TermsReviewFinding[] {
  const weeklyMinutes = weeklyContractMinutes(terms);
  const findings: TermsReviewFinding[] = [];

  if (terms.hourlyWage < rule.minimumHourlyWage) {
    findings.push({ type: 'MINIMUM_WAGE', reasonCode: 'BELOW_MINIMUM', status: 'OPEN' });
  }
  const shortBreakDay = [...terms.schedules]
    .sort((a, b) => a.weekday - b.weekday)
    .find((schedule) => schedule.breakMinutes < requiredBreakMinutes(dailyLaborMinutes(schedule)));
  if (shortBreakDay) {
    findings.push({
      type: 'BREAK_SHORTAGE',
      reasonCode: `DAY_${shortBreakDay.weekday}`,
      status: 'OPEN',
    });
  }
  if (weeklyMinutes >= WEEKLY_HOLIDAY_MIN_WEEKLY_MINUTES) {
    findings.push(
      terms.weeklyHolidayWeekday == null
        ? { type: 'WEEKLY_HOLIDAY', reasonCode: 'HOLIDAY_NOT_SET', status: 'NEEDS_INFORMATION' }
        : { type: 'WEEKLY_HOLIDAY', reasonCode: 'ELIGIBLE', status: 'OPEN' },
    );
  }
  if (weeklyMinutes > 0 && weeklyMinutes < FULL_TIME_WEEKLY_MINUTES) {
    findings.push({ type: 'SHORT_TIME_OVERTIME', reasonCode: 'SHORT_TIME', status: 'OPEN' });
  }
  return findings;
}
