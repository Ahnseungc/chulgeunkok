/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import TermsFormScreen from './TermsFormScreen';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
// 조회가 끝나지 않은 채(push 직후 슬라이드 중) 화면을 본다
vi.mock('@/shared/lib/api-client', () => ({
  apiFetch: () => new Promise(() => {}),
  ApiRequestError: class ApiRequestError extends Error {},
}));

// Seed ActionButton 의 눌림 피드백이 ResizeObserver 를 쓴다. jsdom 엔 없어서 빈 구현을 둔다
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

describe('TermsFormScreen 조회 중', () => {
  afterEach(() => {
    cleanup();
  });

  it('뒤로가기·제목·저장 버튼을 바로 그리고, 저장은 막아 둔다', () => {
    render(<TermsFormScreen storeId="s1" memberId="m1" />);
    expect(screen.getByRole('link', { name: '뒤로 가기, 직원 정보' }).getAttribute('href')).toBe('/owner/s1/members/m1');
    expect(screen.getByRole('heading', { level: 1, name: '근로조건' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '저장' }).hasAttribute('disabled')).toBe(true);
    expect(screen.queryByLabelText('시급 (원)')).toBeNull();
  });
});
