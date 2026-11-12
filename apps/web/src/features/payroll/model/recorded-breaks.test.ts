import { describe, expect, it } from 'vitest';

import { MIN_RECORDED_BREAK_MS, countedBreaks, hasRecordedBreaks } from './recorded-breaks';

const START = new Date('2026-11-02T03:00:00Z');
const after = (ms: number) => new Date(START.getTime() + ms);

describe('recorded-breaks (payroll §3.2)', () => {
  it('1분 미만(길이 0 포함)은 기록된 휴게로 치지 않는다', () => {
    expect(hasRecordedBreaks([{ startAt: START, endAt: START }])).toBe(false);
    expect(hasRecordedBreaks([{ startAt: START, endAt: after(MIN_RECORDED_BREAK_MS - 1) }])).toBe(false);
  });

  it('1분 이상과 열린 휴게는 센다', () => {
    expect(hasRecordedBreaks([{ startAt: START, endAt: after(MIN_RECORDED_BREAK_MS) }])).toBe(true);
    expect(hasRecordedBreaks([{ startAt: START, endAt: null }])).toBe(true);
  });

  it('DTO 문자열 시각도 같은 규칙으로 거른다', () => {
    const breaks = [
      { id: 'short', startAt: START.toISOString(), endAt: after(30_000).toISOString() },
      { id: 'long', startAt: START.toISOString(), endAt: after(10 * MIN_RECORDED_BREAK_MS).toISOString() },
    ];
    expect(countedBreaks(breaks).map((interval) => interval.id)).toEqual(['long']);
  });
});
