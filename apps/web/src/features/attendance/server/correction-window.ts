import { toLocalDate } from '@/features/payroll/model/work-time';

/** 근무일로부터 이 기간이 지나면 근태를 요청·추가할 수 없다 (docs/specs/attendance §7.1·§7.5) */
export const CORRECTION_WINDOW_DAYS = 35;
const DAY_MS = 24 * 60 * 60 * 1000;

/** 근무일(출근 시각의 매장 날짜)이 35일 기한 밖인지 */
export function isOutsideCorrectionWindow(clockInAt: Date, now: Date): boolean {
  const windowStart = toLocalDate(new Date(now.getTime() - CORRECTION_WINDOW_DAYS * DAY_MS));
  return toLocalDate(clockInAt) < windowStart;
}
