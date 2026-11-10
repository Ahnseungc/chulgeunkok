/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import PunchScreen from './PunchScreen';
import type { PunchState } from './usePunch';

let punchState: PunchState = { phase: 'loading' };
vi.mock('./usePunch', () => ({ usePunch: () => ({ state: punchState, submit: vi.fn(), reload: vi.fn() }) }));

// Seed ActionButton 의 눌림 피드백이 ResizeObserver 를 쓴다. jsdom 엔 없어서 빈 구현을 둔다
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

describe('PunchScreen', () => {
  afterEach(() => {
    cleanup();
  });

  it('QR 확인 중에도 하단 버튼 자리를 잡아 두고 누를 수 없게 한다', () => {
    punchState = { phase: 'loading' };
    render(<PunchScreen qrToken="t1" />);
    expect(screen.getByRole('heading', { name: 'QR을 확인하고 있어요' })).toBeTruthy();
    expect(screen.getByRole('button').hasAttribute('disabled')).toBe(true);
  });

  it('출근을 마치면 완료 문구와 확인 버튼을 그린다', () => {
    punchState = { phase: 'done', storeName: '골목카페', action: 'CLOCK_IN', attendance: null };
    render(<PunchScreen qrToken="t1" />);
    expect(screen.getByRole('heading', { name: '콕! 출근 완료' })).toBeTruthy();
    expect(screen.getByText('골목카페')).toBeTruthy();
    expect(screen.getByRole('link', { name: '확인' }).getAttribute('href')).toBe('/me');
  });
});
