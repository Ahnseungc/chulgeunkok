import { countedBreaks } from '@/features/payroll/model/recorded-breaks';
import { formatClock, fromLocalDateTimeInput, toLocalDateTimeInput } from '@/shared/lib/format-time';

import type { AttendanceBreakDto } from './punch-types';

/** 휴게 고치기 시트의 한 줄. 시각은 `HH:mm` (매장 시간대) */
export interface BreakDraft {
  key: string;
  start: string;
  end: string;
}

/** 퇴근까지 끝난 근무 */
export interface ShiftRange {
  clockInAt: string;
  clockOutAt: string;
}

export type BreakDraftResult = { breaks: { startAt: string; endAt: string }[]; error: null } | { breaks: null; error: string };

const MINUTE_MS = 60_000;
const DAY_MINUTES = 24 * 60;

export const EMPTY_TIME_MESSAGE = '휴게 시작과 끝 시각을 넣어 주세요.';
export const OUT_OF_RANGE_MESSAGE = '휴게는 출근과 퇴근 사이로 넣어 주세요.';
export const END_BEFORE_START_MESSAGE = '휴게 끝이 시작보다 늦어야 해요.';
export const OVERLAP_MESSAGE = '휴게 시간이 서로 겹쳐요.';

const minutesOf = (time: string) => {
  const [hours = 0, minutes = 0] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

/** 화면에 보이던 휴게(1분 이상)를 근무 안으로 잘라 `HH:mm` 줄로 바꾼다. 1분 미만은 정산에 안 들어가 시트에서 뺀다 */
export function toBreakDrafts(breaks: readonly AttendanceBreakDto[], shift: ShiftRange): BreakDraft[] {
  const clockInMs = Date.parse(shift.clockInAt);
  const clockOutMs = Date.parse(shift.clockOutAt);
  const clip = (iso: string) => new Date(Math.min(Math.max(Date.parse(iso), clockInMs), clockOutMs)).toISOString();
  return countedBreaks(breaks).map((row) => ({
    key: row.id,
    start: formatClock(clip(row.startAt)),
    end: formatClock(clip(row.endAt ?? shift.clockOutAt)),
  }));
}

/**
 * `HH:mm` → 근무 안의 시각. 출근 시각(분)부터 24시간 안에서 처음 오는 그 시각으로 본다 — 자정을 넘는 근무면 다음 날.
 * 출근·퇴근과 같은 분이면 그 경계 시각으로 맞춘다 (출근 18:00:27에 휴게 18:00 → 18:00:27).
 * ponytail: 분 단위로만 받는다. 초까지 남긴 휴게도 저장하면 분으로 맞춰진다
 */
function toShiftMs(time: string, shift: ShiftRange): number {
  const clockInMinuteMs = Date.parse(fromLocalDateTimeInput(toLocalDateTimeInput(shift.clockInAt)));
  const offset = (minutesOf(time) - minutesOf(formatClock(shift.clockInAt)) + DAY_MINUTES) % DAY_MINUTES;
  return clockInMinuteMs + offset * MINUTE_MS;
}

/** 시트 입력 → PUT 본문. 서버와 같은 규칙(근무 안·끝 > 시작·겹침 없음)을 먼저 확인해 첫 문제를 돌려준다 (docs/specs/attendance §7.6) */
export function resolveBreakDrafts(drafts: readonly BreakDraft[], shift: ShiftRange): BreakDraftResult {
  if (drafts.some((draft) => !draft.start || !draft.end)) return { breaks: null, error: EMPTY_TIME_MESSAGE };
  const clockInMs = Date.parse(shift.clockInAt);
  const clockOutMs = Date.parse(shift.clockOutAt);
  const intervals = drafts
    .map((draft) => ({ startMs: toShiftMs(draft.start, shift), endMs: toShiftMs(draft.end, shift) }))
    .sort((a, b) => a.startMs - b.startMs);
  for (const [index, row] of intervals.entries()) {
    // 출근보다 이른 시각은 다음 날이 되어 퇴근 뒤로 간다. 끝 순서보다 먼저 봐야 "근무 밖" 안내가 나온다
    if (Math.max(row.startMs, row.endMs) > clockOutMs) return { breaks: null, error: OUT_OF_RANGE_MESSAGE };
    if (row.endMs <= row.startMs) return { breaks: null, error: END_BEFORE_START_MESSAGE };
    const previous = intervals[index - 1];
    if (previous && row.startMs < previous.endMs) return { breaks: null, error: OVERLAP_MESSAGE };
  }
  const toIso = (ms: number) => new Date(Math.min(Math.max(ms, clockInMs), clockOutMs)).toISOString();
  return { breaks: intervals.map((row) => ({ startAt: toIso(row.startMs), endAt: toIso(row.endMs) })), error: null };
}
