import { describe, expect, it } from 'vitest';

import { formatClock, formatDuration } from './format-time';

describe('formatClock', () => {
  it('UTC 시각을 서울 시각으로 보여 준다', () => {
    expect(formatClock('2026-11-02T09:02:00Z')).toBe('18:02');
  });

  it('자정 이후는 00시로 보여 준다', () => {
    expect(formatClock('2026-11-02T15:05:00Z')).toBe('00:05');
  });
});

describe('formatDuration', () => {
  it('시간과 분을 함께 보여 준다', () => {
    expect(formatDuration((4 * 60 + 33) * 60_000)).toBe('4시간 33분');
  });

  it('정시는 분을 생략한다', () => {
    expect(formatDuration(2 * 60 * 60_000)).toBe('2시간');
  });

  it('1분 미만은 따로 표시한다', () => {
    expect(formatDuration(30_000)).toBe('1분 미만');
  });
});
