/**
 * 근무시간·예상 기본급 계산 (순수 함수). 정본: docs/specs/payroll §3
 *
 * ponytail: MVP 매장 시간대는 Asia/Seoul 고정이고 서머타임이 없어 UTC+9 고정 오프셋으로 계산한다.
 * 다른 시간대를 지원하면 @date-fns/tz로 바꾼다.
 */

const STORE_UTC_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const SECONDS_PER_HOUR = 3600;
/** 이보다 짧게 일하면 휴게를 차감하지 않는다 (docs/specs/payroll §3.2) */
const MIN_WORK_SECONDS_FOR_BREAK = 4 * 60 * 60;

/** 매장 시간대 날짜 `YYYY-MM-DD` */
export const toLocalDate = (at: Date) => new Date(at.getTime() + STORE_UTC_OFFSET_MS).toISOString().slice(0, 10);
/** 매장 시간대 요일 (0=일) */
export const localWeekday = (at: Date) => new Date(at.getTime() + STORE_UTC_OFFSET_MS).getUTCDay();
/** 매장 시간대 날짜의 00:00 */
export const localMidnight = (localDate: string) => new Date(Date.parse(`${localDate}T00:00:00Z`) - STORE_UTC_OFFSET_MS);

/** 매장 시간대 날짜에 n일 더하기 `YYYY-MM-DD` */
export const addDays = (localDate: string, days: number) =>
  new Date(Date.parse(`${localDate}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

export interface PayPeriod {
  /** 포함 */
  start: string;
  /** 미포함 */
  end: string;
}

/** 화면의 이전·다음 기간 이동용 */
export interface PeriodWithNav extends PayPeriod {
  prevStart: string;
  /** 다음 기간이 아직 시작하지 않았으면 null */
  nextStart: string | null;
}

/** 날짜가 속한 정산 기간. startDay는 1~28 (docs/specs/payroll §3.1) */
export function getPayPeriod(localDate: string, startDay: number): PayPeriod {
  const [year = 0, month = 1, day = 1] = localDate.split('-').map(Number);
  const startMonthIndex = day >= startDay ? month - 1 : month - 2;
  const start = new Date(Date.UTC(year, startMonthIndex, startDay));
  const end = new Date(Date.UTC(year, startMonthIndex + 1, startDay));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

/** 매장 정산 시작일 설정. 바꾸면 다음 기간부터 적용된다 (docs/specs/store §4) */
export interface PayPeriodConfig {
  startDay: number;
  previousStartDay: number | null;
  /** 새 시작일이 적용되는 날짜 `YYYY-MM-DD`. 그 전 날짜는 이전 시작일로 계산 */
  changeEffectiveFrom: string | null;
}

export function payPeriodConfigOf(store: {
  payPeriodStartDay: number;
  previousPayPeriodStartDay: number | null;
  payPeriodStartDayEffectiveFrom: Date | null;
}): PayPeriodConfig {
  return {
    startDay: store.payPeriodStartDay,
    previousStartDay: store.previousPayPeriodStartDay,
    changeEffectiveFrom: store.payPeriodStartDayEffectiveFrom?.toISOString().slice(0, 10) ?? null,
  };
}

/**
 * 시작일 변경을 반영한 정산 기간. 바뀌는 날을 경계로 이전 기간은 거기서 끝나고, 새 기간은 거기서 시작한다
 * (예: 1일 → 21일, 12/1부터 적용이면 11/1~12/1, 12/1~12/21, 12/21~1/21)
 */
export function getStorePayPeriod(localDate: string, config: PayPeriodConfig): PayPeriod {
  const changeFrom = config.changeEffectiveFrom;
  if (!changeFrom || config.previousStartDay === null) return getPayPeriod(localDate, config.startDay);
  if (localDate < changeFrom) {
    const before = getPayPeriod(localDate, config.previousStartDay);
    return { start: before.start, end: before.end < changeFrom ? before.end : changeFrom };
  }
  const after = getPayPeriod(localDate, config.startDay);
  return { start: after.start > changeFrom ? after.start : changeFrom, end: after.end };
}

export interface WorkSegment {
  attendanceId: string;
  localDate: string;
  workedSeconds: number;
  breakSeconds: number;
  recognizedSeconds: number;
  hourlyWage: number;
}

/** 직원이 남긴 휴게. 퇴근한 근무에는 열린 휴게가 없지만, 있으면 퇴근 시각까지로 본다 */
export interface BreakInterval {
  startAt: Date;
  endAt: Date | null;
}

export interface SegmentInput {
  attendance: { id: string; clockInAt: Date; clockOutAt: Date; breakWaived: boolean; breaks: readonly BreakInterval[] };
  terms: { hourlyWage: number; schedules: readonly { weekday: number; breakMinutes: number }[] };
}

interface Piece {
  localDate: string;
  startMs: number;
  endMs: number;
  seconds: number;
}

/**
 * 근태 1건 → 매장 자정 기준 구간들 (docs/specs/payroll §3.2).
 * 직원이 남긴 휴게가 있으면 그 휴게를 각 구간에서 겹친 만큼 뺀다. 없으면 출근 요일 소정 휴게를 첫 구간부터 뺀다.
 * `breakNotScheduled`: 소정 휴게를 빼야 하는데 출근 요일에 소정 스케줄이 없다 (정산 화면 플래그)
 */
export function toSegments(input: SegmentInput): { segments: WorkSegment[]; breakNotScheduled: boolean } {
  const { attendance, terms } = input;
  const pieces = splitAtLocalMidnight(attendance.clockInAt, attendance.clockOutAt);
  const toSegment = (piece: Piece, breakSeconds: number): WorkSegment => ({
    attendanceId: attendance.id,
    localDate: piece.localDate,
    workedSeconds: piece.seconds,
    breakSeconds,
    recognizedSeconds: piece.seconds - breakSeconds,
    hourlyWage: terms.hourlyWage,
  });
  if (attendance.breaks.length > 0) {
    const segments = pieces.map((piece) => toSegment(piece, recordedBreakSeconds(piece, attendance.breaks, attendance.clockOutAt)));
    return { segments, breakNotScheduled: false };
  }

  const totalSeconds = pieces.reduce((sum, piece) => sum + piece.seconds, 0);
  const schedule = terms.schedules.find((candidate) => candidate.weekday === localWeekday(attendance.clockInAt));
  const deductible = !attendance.breakWaived && totalSeconds >= MIN_WORK_SECONDS_FOR_BREAK;
  let remainingBreak = deductible && schedule ? Math.min(schedule.breakMinutes * 60, totalSeconds) : 0;
  const segments = pieces.map((piece) => {
    const breakSeconds = Math.min(remainingBreak, piece.seconds);
    remainingBreak -= breakSeconds;
    return toSegment(piece, breakSeconds);
  });
  return { segments, breakNotScheduled: deductible && !schedule };
}

/** 구간과 겹친 기록 휴게 초. 휴게끼리는 겹치지 않는다 (열린 휴게 1개) */
function recordedBreakSeconds(piece: Piece, breaks: readonly BreakInterval[], clockOutAt: Date): number {
  const overlapMs = breaks.reduce((sum, interval) => {
    const endMs = (interval.endAt ?? clockOutAt).getTime();
    return sum + Math.max(0, Math.min(piece.endMs, endMs) - Math.max(piece.startMs, interval.startAt.getTime()));
  }, 0);
  return Math.min(piece.seconds, Math.floor(overlapMs / 1000));
}

function splitAtLocalMidnight(start: Date, end: Date): Piece[] {
  const pieces: Piece[] = [];
  let cursor = start.getTime();
  while (cursor < end.getTime()) {
    const localDate = toLocalDate(new Date(cursor));
    const nextMidnight = localMidnight(addDays(localDate, 1)).getTime();
    const pieceEnd = Math.min(nextMidnight, end.getTime());
    pieces.push({ localDate, startMs: cursor, endMs: pieceEnd, seconds: Math.floor((pieceEnd - cursor) / 1000) });
    cursor = pieceEnd;
  }
  return pieces;
}

export interface PeriodSummary {
  recognizedSeconds: number;
  basePayEstimate: number;
  byWage: { hourlyWage: number; recognizedSeconds: number }[];
}

/** 기간 안 구간 합계. 원 미만은 합계에서 1회 올림 (docs/specs/payroll §3.3) */
export function summarizePeriod(segments: readonly WorkSegment[], period: PayPeriod): PeriodSummary {
  // 시급 목록이 적용된 날짜 순서로 나오도록 날짜순으로 모은다
  const inPeriod = segments
    .filter((segment) => segment.localDate >= period.start && segment.localDate < period.end)
    .sort((a, b) => a.localDate.localeCompare(b.localDate));
  const byWage = new Map<number, number>();
  for (const segment of inPeriod) {
    byWage.set(segment.hourlyWage, (byWage.get(segment.hourlyWage) ?? 0) + segment.recognizedSeconds);
  }
  const wageSeconds = inPeriod.reduce((sum, segment) => sum + segment.recognizedSeconds * segment.hourlyWage, 0);
  return {
    recognizedSeconds: inPeriod.reduce((sum, segment) => sum + segment.recognizedSeconds, 0),
    basePayEstimate: Math.ceil(wageSeconds / SECONDS_PER_HOUR),
    byWage: [...byWage].map(([hourlyWage, recognizedSeconds]) => ({ hourlyWage, recognizedSeconds })),
  };
}
