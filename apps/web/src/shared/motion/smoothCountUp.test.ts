import { describe, expect, it } from 'vitest';

import {
  easeSmoothCountProgress,
  interpolateSmoothCountValue,
  resolveSmoothCountUpDurationMs,
  resolveSmoothCountUpIntroFrom,
  shouldPlayCountUpFade,
  SMOOTH_COUNT_UP_INTRO_RATIO,
} from './smoothCountUp';

describe('resolveSmoothCountUpDurationMs', () => {
  it('변화가 없으면 0ms', () => {
    expect(resolveSmoothCountUpDurationMs(100_000, 100_000)).toBe(0);
  });

  it('변화량이 클수록 duration이 길어진다', () => {
    const small = resolveSmoothCountUpDurationMs(100_000, 105_000);
    const large = resolveSmoothCountUpDurationMs(100_000, 500_000);

    expect(large).toBeGreaterThan(small);
  });
});

describe('resolveSmoothCountUpIntroFrom', () => {
  it('목표의 35%에서 시작한다', () => {
    expect(resolveSmoothCountUpIntroFrom(100_000)).toBe(
      100_000 * SMOOTH_COUNT_UP_INTRO_RATIO,
    );
  });

  it('0이면 시작점도 0이다', () => {
    expect(resolveSmoothCountUpIntroFrom(0)).toBe(0);
  });
});

describe('shouldPlayCountUpFade', () => {
  it('카운트업이면 페이드한다', () => {
    expect(
      shouldPlayCountUpFade({
        durationSec: 0.9,
        target: 100_000,
        animateFrom: 35_000,
      }),
    ).toBe(true);
  });

  it('duration이 0이면 페이드하지 않는다', () => {
    expect(
      shouldPlayCountUpFade({
        durationSec: 0,
        target: 100_000,
        animateFrom: 0,
      }),
    ).toBe(false);
  });
});

describe('interpolateSmoothCountValue', () => {
  it('증가 시 floor로 단조 증가한다', () => {
    expect(interpolateSmoothCountValue(100, 200, 0)).toBe(100);
    expect(interpolateSmoothCountValue(100, 200, 0.5)).toBe(150);
    expect(interpolateSmoothCountValue(100, 200, 1)).toBe(200);
  });

  it('감소 시 ceil로 단조 감소한다', () => {
    expect(interpolateSmoothCountValue(200, 100, 0.5)).toBe(150);
    expect(interpolateSmoothCountValue(200, 100, 1)).toBe(100);
  });
});

describe('easeSmoothCountProgress', () => {
  it('초반에 많이 진행되고 끝에서 감속한다', () => {
    expect(easeSmoothCountProgress(0.25)).toBeGreaterThan(0.7);
    expect(easeSmoothCountProgress(0.5)).toBeGreaterThan(0.95);
    expect(easeSmoothCountProgress(1)).toBe(1);
  });
});
