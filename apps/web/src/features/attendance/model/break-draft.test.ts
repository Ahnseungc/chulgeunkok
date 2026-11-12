import { describe, expect, it } from 'vitest';

import {
  END_BEFORE_START_MESSAGE,
  EMPTY_TIME_MESSAGE,
  isSameBreaks,
  OUT_OF_RANGE_MESSAGE,
  OVERLAP_MESSAGE,
  resolveBreakDrafts,
  toBreakDrafts,
} from './break-draft';

const iso = (local: string) => new Date(`${local}+09:00`).toISOString();
// 11/2 18:00–23:00
const DAY_SHIFT = { clockInAt: iso('2026-11-02T18:00:00'), clockOutAt: iso('2026-11-02T23:00:00') };
// 11/4 22:00–11/5 03:00, 자정 넘김
const NIGHT_SHIFT = { clockInAt: iso('2026-11-04T22:00:00'), clockOutAt: iso('2026-11-05T03:00:00') };
const draft = (start: string, end: string, key = `${start}-${end}`) => ({ key, start, end });

describe('toBreakDrafts', () => {
  it('1분 이상 휴게만 근무 안으로 잘라 HH:mm 줄로 만든다', () => {
    const breaks = [
      { id: 'b1', startAt: iso('2026-11-02T20:00:00'), endAt: iso('2026-11-02T20:20:00') },
      { id: 'b2', startAt: iso('2026-11-02T21:00:00'), endAt: iso('2026-11-02T21:00:30') },
      { id: 'b3', startAt: iso('2026-11-02T22:50:00'), endAt: iso('2026-11-02T23:30:00') },
    ];
    expect(toBreakDrafts(breaks, DAY_SHIFT)).toEqual([
      { key: 'b1', start: '20:00', end: '20:20', originalStartAt: iso('2026-11-02T20:00:00'), originalEndAt: iso('2026-11-02T20:20:00') },
      { key: 'b3', start: '22:50', end: '23:00', originalStartAt: iso('2026-11-02T22:50:00'), originalEndAt: DAY_SHIFT.clockOutAt },
    ]);
  });
});

describe('손대지 않은 휴게 (정산 값이 바뀌지 않게)', () => {
  const breaks = [
    { id: 'b1', startAt: iso('2026-11-02T20:00:40'), endAt: iso('2026-11-02T20:20:10') },
    { id: 'b2', startAt: iso('2026-11-02T21:00:15'), endAt: iso('2026-11-02T21:10:45') },
  ];
  const original = breaks.map(({ startAt, endAt }) => ({ startAt, endAt }));

  it('그대로 두면 원래 시각을 초까지 그대로 보내고, 열 때 값과 같다', () => {
    const resolved = resolveBreakDrafts(toBreakDrafts(breaks, DAY_SHIFT), DAY_SHIFT).breaks;
    expect(resolved).toEqual(original);
    expect(isSameBreaks(resolved, original)).toBe(true);
  });

  it('한 줄의 끝만 고치면 그 칸만 분으로 바뀌고 나머지는 초까지 그대로다', () => {
    const [first, second] = toBreakDrafts(breaks, DAY_SHIFT);
    const resolved = resolveBreakDrafts([{ ...first!, end: '20:30' }, second!], DAY_SHIFT).breaks;
    expect(resolved).toEqual([
      { startAt: iso('2026-11-02T20:00:40'), endAt: iso('2026-11-02T20:30:00') },
      original[1],
    ]);
    expect(isSameBreaks(resolved, original)).toBe(false);
  });
});

describe('resolveBreakDrafts', () => {
  it('근무 날짜로 시각을 붙여 시작 순으로 돌려준다', () => {
    expect(resolveBreakDrafts([draft('21:00', '21:15'), draft('19:00', '19:30')], DAY_SHIFT)).toEqual({
      breaks: [
        { startAt: iso('2026-11-02T19:00:00'), endAt: iso('2026-11-02T19:30:00') },
        { startAt: iso('2026-11-02T21:00:00'), endAt: iso('2026-11-02T21:15:00') },
      ],
      error: null,
    });
  });

  it('자정을 넘는 근무면 출근보다 이른 시각은 다음 날로 본다', () => {
    expect(resolveBreakDrafts([draft('23:50', '00:20')], NIGHT_SHIFT).breaks).toEqual([
      { startAt: iso('2026-11-04T23:50:00'), endAt: iso('2026-11-05T00:20:00') },
    ]);
  });

  it('출근과 같은 분이면 출근 시각(초 포함)으로 맞춘다', () => {
    const shift = { clockInAt: iso('2026-11-02T18:00:27'), clockOutAt: DAY_SHIFT.clockOutAt };
    expect(resolveBreakDrafts([draft('18:00', '18:10')], shift).breaks?.[0]?.startAt).toBe(iso('2026-11-02T18:00:27'));
  });

  it('24시간 근무에서 끝이 출근과 같은 분이면 퇴근 시각으로 본다', () => {
    const shift = { clockInAt: iso('2026-11-02T09:00:00'), clockOutAt: iso('2026-11-03T09:00:00') };
    expect(resolveBreakDrafts([draft('08:30', '09:00')], shift).breaks).toEqual([
      { startAt: iso('2026-11-03T08:30:00'), endAt: iso('2026-11-03T09:00:00') },
    ]);
  });

  it('빈 목록은 그대로 보낸다 (기록한 휴게 없음)', () => {
    expect(resolveBreakDrafts([], DAY_SHIFT)).toEqual({ breaks: [], error: null });
  });

  it.each([
    ['비어 있는 칸', [draft('20:00', '')], EMPTY_TIME_MESSAGE],
    ['퇴근 뒤', [draft('22:50', '23:10')], OUT_OF_RANGE_MESSAGE],
    ['출근 전에 시작', [draft('17:50', '18:10')], OUT_OF_RANGE_MESSAGE],
    ['끝이 시작보다 이름', [draft('20:30', '20:00')], END_BEFORE_START_MESSAGE],
    ['끝 = 시작', [draft('20:00', '20:00')], END_BEFORE_START_MESSAGE],
    ['겹침', [draft('20:00', '20:30'), draft('20:20', '20:40')], OVERLAP_MESSAGE],
  ])('%s이면 안내 문구를 돌려준다', (_label, drafts, message) => {
    expect(resolveBreakDrafts(drafts, DAY_SHIFT)).toEqual({ breaks: null, error: message });
  });

  it('출근 전 휴게는 근무 밖으로 본다', () => {
    expect(resolveBreakDrafts([draft('17:00', '17:30')], DAY_SHIFT).error).toBe(OUT_OF_RANGE_MESSAGE);
  });
});
