import { countedBreaks } from '@/features/payroll/model/recorded-breaks';
import { formatClock, fromLocalDateTimeInput, toLocalDateTimeInput } from '@/shared/lib/format-time';

import {
  BREAK_END_BEFORE_START_MESSAGE as END_BEFORE_START_MESSAGE,
  BREAK_OUT_OF_RANGE_MESSAGE as OUT_OF_RANGE_MESSAGE,
  BREAK_OVERLAP_MESSAGE as OVERLAP_MESSAGE,
} from './break-rules';
import type { AttendanceBreakDto } from './punch-types';

export { END_BEFORE_START_MESSAGE, OUT_OF_RANGE_MESSAGE, OVERLAP_MESSAGE };

/**
 * 휴게 고치기 시트의 한 줄. 시각은 `HH:mm` (매장 시간대).
 * 기존 휴게는 근무 안으로 자른 원래 시각(초 포함)을 들고 있어, 칸을 그대로 두면 그 시각을 그대로 보낸다
 */
export interface BreakDraft {
  key: string;
  start: string;
  end: string;
  originalStartAt?: string;
  originalEndAt?: string;
}

/** 퇴근까지 끝난 근무 */
export interface ShiftRange {
  clockInAt: string;
  clockOutAt: string;
}

export type BreakPayload = { startAt: string; endAt: string }[];
export type BreakDraftResult = { breaks: BreakPayload; error: null } | { breaks: null; error: string };

const MINUTE_MS = 60_000;
const DAY_MINUTES = 24 * 60;
const DAY_MS = DAY_MINUTES * MINUTE_MS;

export const EMPTY_TIME_MESSAGE = '휴게 시작과 끝 시각을 넣어 주세요.';

const minutesOf = (time: string) => {
  const [hours = 0, minutes = 0] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

/** 화면에 보이던 휴게(1분 이상)를 근무 안으로 잘라 `HH:mm` 줄로 바꾼다. 1분 미만은 정산에 안 들어가 시트에서 뺀다 */
export function toBreakDrafts(breaks: readonly AttendanceBreakDto[], shift: ShiftRange): BreakDraft[] {
  const clockInMs = Date.parse(shift.clockInAt);
  const clockOutMs = Date.parse(shift.clockOutAt);
  const clip = (iso: string) => new Date(Math.min(Math.max(Date.parse(iso), clockInMs), clockOutMs)).toISOString();
  return countedBreaks(breaks).map((row) => {
    const originalStartAt = clip(row.startAt);
    const originalEndAt = clip(row.endAt ?? shift.clockOutAt);
    return { key: row.id, start: formatClock(originalStartAt), end: formatClock(originalEndAt), originalStartAt, originalEndAt };
  });
}

/**
 * `HH:mm` → 근무 안의 시각. 출근 시각(분)부터 24시간 안에서 처음 오는 그 시각으로 본다 — 자정을 넘는 근무면 다음 날.
 * 24시간 근무의 끝 칸이 출근과 같은 분이면 다음 날(퇴근 쪽)로 본다
 */
function toShiftMs(time: string, shift: ShiftRange, isEnd: boolean): number {
  const clockInMinuteMs = Date.parse(fromLocalDateTimeInput(toLocalDateTimeInput(shift.clockInAt)));
  const offset = (minutesOf(time) - minutesOf(formatClock(shift.clockInAt)) + DAY_MINUTES) % DAY_MINUTES;
  const fullDay = isEnd && offset === 0 && Date.parse(shift.clockOutAt) - clockInMinuteMs >= DAY_MS;
  return clockInMinuteMs + (fullDay ? DAY_MS : offset * MINUTE_MS);
}

/** 칸을 그대로 두었으면 원래 시각(초 포함), 고쳤으면 입력한 분 */
function toDraftMs(draft: BreakDraft, field: 'start' | 'end', shift: ShiftRange): number {
  const original = field === 'start' ? draft.originalStartAt : draft.originalEndAt;
  if (original && formatClock(original) === draft[field]) return Date.parse(original);
  return toShiftMs(draft[field], shift, field === 'end');
}

/** 시작 순 휴게의 첫 문제. 출근보다 이른 시각은 다음 날이 되어 퇴근 뒤로 가므로 "근무 밖"을 먼저 본다 */
function firstBreakError(intervals: readonly { startMs: number; endMs: number }[], clockOutMs: number): string | null {
  for (const [index, row] of intervals.entries()) {
    if (Math.max(row.startMs, row.endMs) > clockOutMs) return OUT_OF_RANGE_MESSAGE;
    if (row.endMs <= row.startMs) return END_BEFORE_START_MESSAGE;
    const previous = intervals[index - 1];
    if (previous && row.startMs < previous.endMs) return OVERLAP_MESSAGE;
  }
  return null;
}

/**
 * 시트 입력 → PUT 본문. 서버와 같은 규칙(근무 안·끝 > 시작·겹침 없음)을 먼저 확인해 첫 문제를 돌려준다 (docs/specs/attendance §7.6).
 * 출근·퇴근과 같은 분이면 그 경계 시각으로 맞춘다 (출근 18:00:27에 휴게 18:00 → 18:00:27)
 */
export function resolveBreakDrafts(drafts: readonly BreakDraft[], shift: ShiftRange): BreakDraftResult {
  if (drafts.some((draft) => !draft.start || !draft.end)) return { breaks: null, error: EMPTY_TIME_MESSAGE };
  const clockInMs = Date.parse(shift.clockInAt);
  const clockOutMs = Date.parse(shift.clockOutAt);
  const intervals = drafts
    .map((draft) => ({ startMs: toDraftMs(draft, 'start', shift), endMs: toDraftMs(draft, 'end', shift) }))
    .sort((a, b) => a.startMs - b.startMs);
  const error = firstBreakError(intervals, clockOutMs);
  if (error) return { breaks: null, error };
  const toIso = (ms: number) => new Date(Math.min(Math.max(ms, clockInMs), clockOutMs)).toISOString();
  return { breaks: intervals.map((row) => ({ startAt: toIso(row.startMs), endAt: toIso(row.endMs) })), error: null };
}

/** 보낼 휴게가 지금 기록(시트를 열 때 값)과 같은지 — 같으면 저장할 것이 없다 */
export const isSameBreaks = (a: BreakPayload | null, b: BreakPayload | null) =>
  a !== null && b !== null && a.length === b.length && a.every((row, index) => row.startAt === b[index]?.startAt && row.endAt === b[index]?.endAt);
