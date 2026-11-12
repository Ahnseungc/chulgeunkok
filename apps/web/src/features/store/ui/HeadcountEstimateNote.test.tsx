/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import HeadcountEstimateNote from './HeadcountEstimateNote';

const estimate = { month: '2026-10', average: 5.2, workerDays: 52, operatingDays: 10 };

describe('HeadcountEstimateNote', () => {
  afterEach(() => cleanup());

  it('지난달 평균과 참고값 안내를 보여 준다', () => {
    render(<HeadcountEstimateNote estimate={{ ...estimate, mismatch: null }} />);
    expect(screen.getByText('출근 기록으로 보면 지난달 하루 평균 5.2명이 일했어요.')).toBeTruthy();
    expect(screen.getByText('참고값이며 법적 판단이 아니에요.')).toBeTruthy();
    expect(screen.queryByText(/규모를 다시 확인해 주세요/)).toBeNull();
  });

  it('신고한 규모와 어긋나면 다시 확인하라고 알린다', () => {
    render(<HeadcountEstimateNote estimate={{ ...estimate, mismatch: 'MAYBE_UNDER_5' }} />);
    expect(screen.getByText('신고한 규모와 달라요. 규모를 다시 확인해 주세요.')).toBeTruthy();
  });
});
