/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import PhoneVerificationPrompt from './PhoneVerificationPrompt';

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

describe('PhoneVerificationPrompt', () => {
  afterEach(() => {
    cleanup();
    router.push.mockReset();
    window.history.replaceState(null, '', '/');
  });

  it('누르면 인증 화면으로 가고, 인증 뒤 지금 화면으로 돌아올 경로를 붙인다', () => {
    window.history.replaceState(null, '', '/owner/s1/payroll');
    render(<PhoneVerificationPrompt />);
    expect(screen.getByRole('alert').textContent).toContain('급여를 보려면 휴대폰 인증이 필요해요.');
    fireEvent.click(screen.getByRole('button', { name: '휴대폰 인증하기' }));
    expect(router.push).toHaveBeenCalledWith('/owner/login?verify=1&next=%2Fowner%2Fs1%2Fpayroll');
  });
});
