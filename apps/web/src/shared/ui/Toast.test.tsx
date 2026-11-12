/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ToastProvider from './Toast';
import { useToast } from './useToast';

// Seed Snackbar 영역이 높이를 ResizeObserver 로 잰다. jsdom 엔 없어서 빈 구현을 둔다
const stubResizeObserver = () =>
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );

const Trigger = () => {
  const toast = useToast();
  return (
    <button type="button" onClick={() => toast.error('급여 지급일을 넣어 주세요.')}>
      띄우기
    </button>
  );
};

describe('ToastProvider · useToast', () => {
  beforeEach(() => {
    stubResizeObserver();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('문구를 status 로 띄운다', async () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: '띄우기' }));
    expect((await screen.findByRole('status')).textContent).toBe('급여 지급일을 넣어 주세요.');
  });
});
