/**
 * @vitest-environment jsdom
 */
import { cleanup, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { SmoothCountUpNumber } from './SmoothCountUpNumber';
import { resolveSmoothCountUpIntroFrom } from './smoothCountUp';
import { useIntroCountUp } from './useIntroCountUp';

describe('useIntroCountUp', () => {
  it('데이터 전엔 카운트업이 없고, 첫 값에서만 35%부터 카운트업한다', () => {
    const { result, rerender } = renderHook(({ value }: { value: number | null }) => useIntroCountUp(value), {
      initialProps: { value: null as number | null },
    });
    expect(result.current.animateFrom).toBeUndefined();

    rerender({ value: 100_000 });
    expect(result.current.animateFrom).toBe(resolveSmoothCountUpIntroFrom(100_000));
    expect(result.current.durationSec).toBeGreaterThan(0);

    // 같은 값으로 다시 조회돼도(폴링) 같은 인트로라 다시 시작하지 않는다
    rerender({ value: 100_000 });
    expect(result.current.animateFrom).toBe(resolveSmoothCountUpIntroFrom(100_000));
  });

  it('값이 바뀌면(폴링·되살아남 재조회) 바로 바꾸고, 원래 값으로 돌아와도 다시 재생하지 않는다', () => {
    const { result, rerender } = renderHook(({ value }: { value: number }) => useIntroCountUp(value), {
      initialProps: { value: 3 },
    });
    rerender({ value: 4 });
    expect(result.current).toEqual({ animateFrom: undefined, durationSec: 0 });

    rerender({ value: 3 });
    expect(result.current).toEqual({ animateFrom: undefined, durationSec: 0 });
  });
});

describe('SmoothCountUpNumber', () => {
  afterEach(() => {
    cleanup();
  });

  it('animateFrom 이 있으면 시작 값부터 그린다', () => {
    render(<SmoothCountUpNumber value={100_000} animateFrom={35_000} durationSec={0.9} suffix="원" />);
    expect(screen.getByText('35,000')).toBeTruthy();
  });

  it('animateFrom 이 없으면 바로 최종 값을 그린다', () => {
    render(<SmoothCountUpNumber value={100_000} />);
    expect(screen.getByText('100,000')).toBeTruthy();
  });
});
