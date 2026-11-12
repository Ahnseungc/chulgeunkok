/**
 * 직원이 남긴 휴게 중 "기록된 휴게"로 치는 것 (docs/specs/payroll §3.2, attendance §3.6).
 * 잘못 누름·길이 0으로 접힌 휴게가 소정 휴게 자동 차감을 끄지 않도록 1분 미만은 세지 않는다.
 * 열린 휴게(끝 없음)는 진행 중이라 센다
 */
export const MIN_RECORDED_BREAK_MS = 60_000;

type Instant = Date | string;

interface BreakLike {
  startAt: Instant;
  endAt: Instant | null;
}

const toMs = (at: Instant) => new Date(at).getTime();

export const isCountedBreak = (interval: BreakLike) =>
  interval.endAt === null || toMs(interval.endAt) - toMs(interval.startAt) >= MIN_RECORDED_BREAK_MS;

export const countedBreaks = <T extends BreakLike>(breaks: readonly T[]): T[] => breaks.filter(isCountedBreak);

export const hasRecordedBreaks = (breaks: readonly BreakLike[]) => breaks.some(isCountedBreak);
