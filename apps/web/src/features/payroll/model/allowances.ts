/**
 * 예상 주휴수당·가산수당·유급휴일수당 (순수 함수). 정본: docs/specs/payroll §3.6·§3.7
 * 기준값은 노무사 검증 전 설계 가정 (인덱스 Q6). 모두 "예상"이며 실제 지급액이 아니다.
 */

import {
  FULL_TIME_WEEKLY_MINUTES,
  WEEKLY_HOLIDAY_MIN_WEEKLY_MINUTES,
  dailyLaborMinutes,
  weeklyContractMinutes,
  type TermsRuleInput,
} from '@/features/labor/model/labor-rules';
import {
  DAILY_LIMIT_SECONDS,
  WEEKLY_LIMIT_SECONDS,
  nightWorkSeconds,
  weekdayOfLocalDate,
  weekStartOf,
} from '@/features/labor/model/work-record-rules';

import { countedBreaks } from './recorded-breaks';
import { localMidnight, type BreakInterval, type PayPeriod, type WorkSegment } from './work-time';

const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const SECONDS_PER_HOUR = 3600;
const DAY_MS = 24 * SECONDS_PER_HOUR * 1000;
const WEEK_DAYS = 7;
const PERCENT = 100;
/** 연장·야간·휴일(8시간 이내) 가산율 50% (근기법 §56) */
const PREMIUM_PERCENT = 50;
/** 휴일근로 8시간 초과분 100% (근기법 §56②) */
const HOLIDAY_OVER_LIMIT_PERCENT = 100;
const HOLIDAY_LIMIT_SECONDS = 8 * SECONDS_PER_HOUR;
/** 주휴수당 = min(주 소정분 ÷ 2400, 1) × 8시간 × 시급 = min(주 소정분, 2400) × 시급 ÷ 300 */
const WEEKLY_HOLIDAY_DIVISOR = FULL_TIME_WEEKLY_MINUTES / 8;

export interface AllowanceTerms extends TermsRuleInput {
  effectiveFrom: Date;
  effectiveTo: Date | null;
}

/** 정상 종료(CLOSED) 근무 1건 */
export interface AllowanceWork {
  clockInAt: Date;
  clockOutAt: Date;
  /** 기간으로 자르지 않은 구간 */
  segments: readonly WorkSegment[];
  terms: AllowanceTerms;
  /** 직원이 남긴 휴게 (attendance §3.6). 있으면 야간에서 겹친 만큼 뺀다 */
  breaks: readonly BreakInterval[];
}

export interface AllowanceInput {
  period: PayPeriod;
  /** 오늘 (매장 시간대). 주 단위 항목은 끝난 주만 센다 */
  today: string;
  /** 직원의 근로조건 버전 전부 (결근 판단용) */
  terms: readonly AllowanceTerms[];
  /** 출근 기록이 있는 날짜. 무효는 빼고 근무 중·퇴근 누락은 넣는다 */
  attendedDates: ReadonlySet<string>;
  /** 기간 첫 주 월요일부터의 근무 */
  works: readonly AllowanceWork[];
  /** 그날 사업장 규모 신고가 5인 이상인가 */
  isFiveOrMore: (localDate: string) => boolean;
  /** 그날 유급휴일(공휴일·노동절)인가. 규모에 따른 적용은 부르는 쪽에서 판단한다 (§3.7) */
  isPaidHoliday: (localDate: string) => boolean;
}

export interface AllowanceEstimate {
  weeklyHolidayPay: number;
  weeklyHolidayWeeks: number;
  overtimePremium: number;
  overtimeSeconds: number;
  nightPremium: number;
  nightSeconds: number;
  holidayPremium: number;
  holidaySeconds: number;
  /** 쉬어도 받는 유급휴일(공휴일·노동절) 소정근로분 */
  paidHolidayPay: number;
  paidHolidayDays: number;
  /** 다섯 항목 합 (원) */
  total: number;
}

interface DayWork {
  recognizedSeconds: number;
  nightSeconds: number;
  /** 그날 마지막 근무의 시급·근로조건 (ponytail: 하루 안에서 시급이 바뀌는 경우는 마지막 값으로 본다) */
  hourlyWage: number;
  terms: AllowanceTerms;
  /** 주휴일·유급휴일 근무 → 휴일근로 (연장으로 세지 않는다) */
  holiday: boolean;
}

/** 가산 금액 분자: 초 × 시급 × 퍼센트 */
interface PremiumTally {
  seconds: number;
  numerator: number;
}

const addDays = (localDate: string, days: number) =>
  new Date(Date.parse(`${localDate}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
const inPeriod = (localDate: string, period: PayPeriod) => localDate >= period.start && localDate < period.end;
const premiumWon = (tally: PremiumTally) => Math.ceil(tally.numerator / (SECONDS_PER_HOUR * PERCENT));

const isShortTime = (terms: AllowanceTerms) => {
  const weekly = weeklyContractMinutes(terms);
  return weekly > 0 && weekly < FULL_TIME_WEEKLY_MINUTES;
};
const isWeeklyHoliday = (localDate: string, terms: AllowanceTerms) =>
  terms.weeklyHolidayWeekday === weekdayOfLocalDate(localDate);
/** 그날 소정근로분 (휴게 제외). 소정 요일이 아니거나 주마다 다르면 0 */
const scheduledLaborMinutesOn = (localDate: string, terms: AllowanceTerms) => {
  if (terms.scheduleVaries) return 0;
  const schedule = terms.schedules.find((candidate) => candidate.weekday === weekdayOfLocalDate(localDate));
  return schedule ? dailyLaborMinutes(schedule) : 0;
};

/** 그날 00:00에 유효한 근로조건 */
function termsOn(terms: readonly AllowanceTerms[], localDate: string): AllowanceTerms | undefined {
  const at = localMidnight(localDate).getTime();
  return terms.find(
    (candidate) => candidate.effectiveFrom.getTime() <= at && (!candidate.effectiveTo || at < candidate.effectiveTo.getTime()),
  );
}

/**
 * 구간 [start, end)의 야간 초. 남긴 휴게가 있으면 휴게와 겹친 야간을 뺀다.
 * ponytail: 남긴 휴게가 없으면 휴게를 언제 썼는지 모르므로 야간을 인정 시간으로만 자른다
 */
function segmentNightSeconds(work: AllowanceWork, segment: WorkSegment, range: { start: Date; end: Date }): number {
  const night = nightWorkSeconds(range.start, range.end);
  const recorded = countedBreaks(work.breaks);
  if (recorded.length === 0) return Math.min(night, segment.recognizedSeconds);
  const breakNight = recorded.reduce((sum, interval) => {
    const start = Math.max(interval.startAt.getTime(), range.start.getTime());
    const end = Math.min((interval.endAt ?? work.clockOutAt).getTime(), range.end.getTime());
    return end > start ? sum + nightWorkSeconds(new Date(start), new Date(end)) : sum;
  }, 0);
  return Math.max(0, night - breakNight);
}

/** 근무를 날짜별로 모은다. 야간은 그 구간의 22:00–06:00 겹침에서 휴게를 뺀다 */
export function groupByDay(
  works: readonly AllowanceWork[],
  isPaidHoliday: (localDate: string) => boolean,
): Map<string, DayWork> {
  const days = new Map<string, DayWork>();
  const ordered = [...works].sort((a, b) => a.clockInAt.getTime() - b.clockInAt.getTime());
  for (const work of ordered) {
    for (const segment of work.segments) {
      const dayStart = localMidnight(segment.localDate).getTime();
      const start = new Date(Math.max(work.clockInAt.getTime(), dayStart));
      const end = new Date(Math.min(work.clockOutAt.getTime(), dayStart + DAY_MS));
      const night = segmentNightSeconds(work, segment, { start, end });
      const previous = days.get(segment.localDate);
      days.set(segment.localDate, {
        recognizedSeconds: (previous?.recognizedSeconds ?? 0) + segment.recognizedSeconds,
        nightSeconds: (previous?.nightSeconds ?? 0) + night,
        hourlyWage: segment.hourlyWage,
        terms: work.terms,
        holiday: isWeeklyHoliday(segment.localDate, work.terms) || isPaidHoliday(segment.localDate),
      });
    }
  }
  return days;
}

/** 그날 연장 초. 휴일은 휴일근로로 따로 센다. 단시간근로자는 그날 소정근로를 넘는 시간 (기간제법 §6③) */
export function dailyOvertimeSeconds(localDate: string, day: DayWork): number {
  if (day.holiday) return 0;
  if (!isShortTime(day.terms)) return Math.max(0, day.recognizedSeconds - DAILY_LIMIT_SECONDS);
  // ponytail: 주마다 다른 단시간근로자는 그날 소정을 모르므로 일 단위 연장을 세지 않는다
  if (day.terms.scheduleVaries) return 0;
  return Math.max(0, day.recognizedSeconds - scheduledLaborMinutesOn(localDate, day.terms) * SECONDS_PER_MINUTE);
}

/** 기간 안 날짜의 연장·야간·휴일 가산. 5인 이상 신고일만 (PRD §6.3) */
function tallyDaily(days: Map<string, DayWork>, input: AllowanceInput) {
  const overtime: PremiumTally = { seconds: 0, numerator: 0 };
  const night: PremiumTally = { seconds: 0, numerator: 0 };
  const holiday: PremiumTally = { seconds: 0, numerator: 0 };
  for (const [localDate, day] of days) {
    if (!inPeriod(localDate, input.period) || !input.isFiveOrMore(localDate)) continue;
    const overtimeSeconds = dailyOvertimeSeconds(localDate, day);
    overtime.seconds += overtimeSeconds;
    overtime.numerator += overtimeSeconds * day.hourlyWage * PREMIUM_PERCENT;
    night.seconds += day.nightSeconds;
    night.numerator += day.nightSeconds * day.hourlyWage * PREMIUM_PERCENT;
    if (!day.holiday) continue;
    const withinLimit = Math.min(day.recognizedSeconds, HOLIDAY_LIMIT_SECONDS);
    holiday.seconds += day.recognizedSeconds;
    holiday.numerator +=
      (withinLimit * PREMIUM_PERCENT + (day.recognizedSeconds - withinLimit) * HOLIDAY_OVER_LIMIT_PERCENT) * day.hourlyWage;
  }
  return { overtime, night, holiday };
}

/** 기간 안에 일요일이 있고 이미 끝난 주의 월요일들. 주 단위 항목은 일요일이 속한 기간에 넣는다 */
export function closedWeekStarts(period: PayPeriod, today: string): string[] {
  const weeks: string[] = [];
  for (let monday = weekStartOf(period.start); addDays(monday, WEEK_DAYS - 1) < period.end; monday = addDays(monday, WEEK_DAYS)) {
    if (addDays(monday, WEEK_DAYS - 1) < today) weeks.push(monday);
  }
  return weeks;
}

const weekDates = (monday: string) => Array.from({ length: WEEK_DAYS }, (_, index) => addDays(monday, index));

/** 통상근로자 주 40시간 초과분 (일 8시간 초과로 이미 센 시간·휴일근로는 뺀다) */
function weeklyOvertimeSeconds(dates: string[], days: Map<string, DayWork>): { seconds: number; hourlyWage: number } {
  const worked = dates.flatMap((localDate) => {
    const day = days.get(localDate);
    return day && !day.holiday ? [{ localDate, day }] : [];
  });
  const last = worked.at(-1)?.day;
  if (!last || isShortTime(last.terms)) return { seconds: 0, hourlyWage: 0 };
  const nonDailyOvertime = worked.reduce(
    (sum, { localDate, day }) => sum + day.recognizedSeconds - dailyOvertimeSeconds(localDate, day),
    0,
  );
  return { seconds: Math.max(0, nonDailyOvertime - WEEKLY_LIMIT_SECONDS), hourlyWage: last.hourlyWage };
}

/** 그 주 소정 근무일에 모두 출근했나. 유급휴일은 쉬어도 된다. 주마다 다르면 소정일을 모르므로 한 번이라도 출근했으면 개근으로 본다 */
function attendedAllScheduledDays(dates: string[], input: AllowanceInput, weekTerms: AllowanceTerms): boolean {
  if (weekTerms.scheduleVaries) return dates.some((localDate) => input.attendedDates.has(localDate));
  return dates.every((localDate) => {
    const terms = termsOn(input.terms, localDate);
    const scheduled = terms?.schedules.some((schedule) => schedule.weekday === weekdayOfLocalDate(localDate));
    return !scheduled || input.isPaidHoliday(localDate) || input.attendedDates.has(localDate);
  });
}

/** 주휴수당 분자(소정분 × 시급). 주 소정 15시간 이상 + 개근 (PRD §6.3) */
function weeklyHolidayNumerator(dates: string[], input: AllowanceInput): number {
  const weekTerms = termsOn(input.terms, dates[WEEK_DAYS - 1] ?? '');
  if (!weekTerms) return 0;
  const weeklyMinutes = weeklyContractMinutes(weekTerms);
  if (weeklyMinutes < WEEKLY_HOLIDAY_MIN_WEEKLY_MINUTES || !attendedAllScheduledDays(dates, input, weekTerms)) return 0;
  return Math.min(weeklyMinutes, FULL_TIME_WEEKLY_MINUTES) * weekTerms.hourlyWage;
}

/**
 * 기간 안 지난 유급휴일의 소정근로분 (분 × 시급). 출근 여부와 상관없이 받는다 (근로했으면 임금·가산은 따로).
 * 주휴일과 겹치면 주휴수당으로 이미 받으므로 소정 요일이 아니어서 0이 된다.
 */
function tallyPaidHolidays(input: AllowanceInput): { days: number; numerator: number } {
  const tally = { days: 0, numerator: 0 };
  for (let localDate = input.period.start; localDate < input.period.end && localDate < input.today; localDate = addDays(localDate, 1)) {
    if (!input.isPaidHoliday(localDate)) continue;
    const terms = termsOn(input.terms, localDate);
    const minutes = terms ? scheduledLaborMinutesOn(localDate, terms) : 0;
    if (!terms || minutes === 0) continue;
    tally.days += 1;
    tally.numerator += minutes * terms.hourlyWage;
  }
  return tally;
}

/** 직원 1명의 기간 예상 주휴·가산·유급휴일수당. 항목마다 기간 합계에서 1회 원 미만 올림 */
export function estimateAllowances(input: AllowanceInput): AllowanceEstimate {
  const days = groupByDay(input.works, input.isPaidHoliday);
  const paidHolidays = tallyPaidHolidays(input);
  const { overtime, night, holiday } = tallyDaily(days, input);
  let weeklyHolidayNumeratorSum = 0;
  let weeklyHolidayWeeks = 0;
  for (const monday of closedWeekStarts(input.period, input.today)) {
    const dates = weekDates(monday);
    const holidayNumerator = weeklyHolidayNumerator(dates, input);
    weeklyHolidayNumeratorSum += holidayNumerator;
    weeklyHolidayWeeks += holidayNumerator > 0 ? 1 : 0;
    if (!input.isFiveOrMore(dates[WEEK_DAYS - 1] ?? '')) continue;
    const weekly = weeklyOvertimeSeconds(dates, days);
    overtime.seconds += weekly.seconds;
    overtime.numerator += weekly.seconds * weekly.hourlyWage * PREMIUM_PERCENT;
  }
  const estimate = {
    weeklyHolidayPay: Math.ceil(weeklyHolidayNumeratorSum / WEEKLY_HOLIDAY_DIVISOR),
    weeklyHolidayWeeks,
    overtimePremium: premiumWon(overtime),
    overtimeSeconds: overtime.seconds,
    nightPremium: premiumWon(night),
    nightSeconds: night.seconds,
    holidayPremium: premiumWon(holiday),
    holidaySeconds: holiday.seconds,
    paidHolidayPay: Math.ceil(paidHolidays.numerator / MINUTES_PER_HOUR),
    paidHolidayDays: paidHolidays.days,
  };
  return {
    ...estimate,
    total:
      estimate.weeklyHolidayPay +
      estimate.overtimePremium +
      estimate.nightPremium +
      estimate.holidayPremium +
      estimate.paidHolidayPay,
  };
}
