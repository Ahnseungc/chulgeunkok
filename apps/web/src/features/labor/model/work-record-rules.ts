/**
 * 근무 기록에서 나오는 판단 (순수 함수). docs/specs/attendance §5.1, labor §5
 * 기준값은 노무사 검증 전 설계 가정 (인덱스 Q6).
 */

import { localMidnight, localWeekday, toLocalDate } from '@/features/payroll/model/work-time';

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** 소정 퇴근 후 이만큼 지나면 퇴근 누락 (docs/specs/attendance §5.1, 인덱스 Q3) */
export const MISSING_AFTER_SCHEDULED_END_MS = 4 * HOUR_MS;
/** 소정 스케줄이 없거나 소정 퇴근 뒤에 출근했으면 출근 후 이만큼 */
export const MISSING_AFTER_UNSCHEDULED_CLOCK_IN_MS = 16 * HOUR_MS;

/** 야간근로 22:00–06:00 (근기법 §56) */
const NIGHT_START_MINUTE = 22 * 60;
const NIGHT_END_MINUTE = 6 * 60;
/** 통상근로자 연장 기준: 1일 8시간, 1주 40시간 */
export const DAILY_LIMIT_SECONDS = 8 * 3600;
export const WEEKLY_LIMIT_SECONDS = 40 * 3600;

/**
 * 근무 중 기록을 퇴근 누락으로 바꾸는 시각.
 * 소정 퇴근 시각이 지나서 출근했으면(추가 근무) 소정 기준을 쓰지 않는다 — 출근하자마자 누락이 되면 안 된다.
 */
export function missingClockOutDeadline(
  clockInAt: Date,
  schedule: { startMinute: number; workMinutes: number } | undefined,
): Date {
  const unscheduled = new Date(clockInAt.getTime() + MISSING_AFTER_UNSCHEDULED_CLOCK_IN_MS);
  if (!schedule) return unscheduled;
  const scheduledEnd = localMidnight(toLocalDate(clockInAt)).getTime() + (schedule.startMinute + schedule.workMinutes) * MINUTE_MS;
  if (clockInAt.getTime() >= scheduledEnd) return unscheduled;
  return new Date(scheduledEnd + MISSING_AFTER_SCHEDULED_END_MS);
}

/** 근무 구간이 22:00–06:00과 겹치는 분 */
export const nightWorkMinutes = (start: Date, end: Date) => Math.floor((nightWorkSeconds(start, end) * SECOND_MS) / MINUTE_MS);

/** 근무 구간이 22:00–06:00과 겹치는 초 */
export function nightWorkSeconds(start: Date, end: Date): number {
  let total = 0;
  // 출근 전날 밤 구간부터 퇴근 날 밤 구간까지 하루씩 본다
  for (let day = localMidnight(toLocalDate(new Date(start.getTime() - DAY_MS))).getTime(); day < end.getTime(); day += DAY_MS) {
    const nightStart = day + NIGHT_START_MINUTE * MINUTE_MS;
    const nightEnd = day + DAY_MS + NIGHT_END_MINUTE * MINUTE_MS;
    total += Math.max(0, Math.min(end.getTime(), nightEnd) - Math.max(start.getTime(), nightStart));
  }
  return Math.floor(total / SECOND_MS);
}

/** 그 날짜가 속한 주의 월요일 (매장 시간대) */
export function weekStartOf(localDate: string): string {
  const date = new Date(`${localDate}T00:00:00Z`);
  const daysFromMonday = (date.getUTCDay() + 6) % 7;
  return new Date(date.getTime() - daysFromMonday * DAY_MS).toISOString().slice(0, 10);
}

export const weekdayOfLocalDate = (localDate: string) => localWeekday(localMidnight(localDate));

export interface OvertimeInput {
  isShortTime: boolean;
  /** 이 근무가 걸친 날짜들 */
  dates: readonly string[];
  /** 날짜별 그날 인정 초 (같은 직원의 모든 정상 근무 합) */
  dayRecognizedSeconds: ReadonlyMap<string, number>;
  /** 이 근무가 속한 주 인정 초 */
  weekRecognizedSeconds: number;
  /** 날짜별 소정 근로분 (휴게 제외). 소정이 없는 날은 0 */
  scheduledLaborMinutes: (localDate: string) => number;
}

/** 연장근로 검토 사유. 없으면 null (docs/specs/labor §5) */
export function overtimeReason(input: OvertimeInput): { reasonCode: string; localDate: string } | null {
  for (const localDate of input.dates) {
    const day = input.dayRecognizedSeconds.get(localDate) ?? 0;
    // 단시간근로자는 그날 소정근로를 넘는 시간부터 (기간제법 §6③)
    if (input.isShortTime && day > input.scheduledLaborMinutes(localDate) * 60) return { reasonCode: 'SHORT_TIME_DAILY', localDate };
    if (!input.isShortTime && day > DAILY_LIMIT_SECONDS) return { reasonCode: 'DAILY_OVER_8H', localDate };
  }
  if (!input.isShortTime && input.weekRecognizedSeconds > WEEKLY_LIMIT_SECONDS) {
    return { reasonCode: 'WEEKLY_OVER_40H', localDate: input.dates[0] ?? '' };
  }
  return null;
}
