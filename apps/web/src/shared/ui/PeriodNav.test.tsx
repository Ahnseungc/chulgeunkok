/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import PeriodNav from './PeriodNav';

const PERIOD = { start: '2026-11-01', end: '2026-11-30', prevStart: '2026-10-01', nextStart: null };

// Seed ActionButton 의 눌림 피드백이 ResizeObserver 를 쓴다. jsdom 엔 없어서 빈 구현을 둔다
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

describe('PeriodNav', () => {
  afterEach(() => {
    cleanup();
  });

  it('조회 전에도 같은 자리를 잡고, 이동 버튼은 막는다', () => {
    render(<PeriodNav period={null} onChange={vi.fn()} />);
    expect(screen.getByRole('group', { name: '정산 기간' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '이전 기간' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: '다음 기간' }).hasAttribute('disabled')).toBe(true);
  });

  it('기간이 오면 이전 기간으로 옮길 수 있고, 다음 기간이 없으면 막는다', () => {
    const onChange = vi.fn();
    render(<PeriodNav period={PERIOD} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: '이전 기간' }));
    expect(onChange).toHaveBeenCalledWith('2026-10-01');
    expect(screen.getByRole('button', { name: '다음 기간' }).hasAttribute('disabled')).toBe(true);
  });
});
