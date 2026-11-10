/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import MemberDetailScreen from './MemberDetailScreen';

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

describe('MemberDetailScreen 조회 중', () => {
  afterEach(() => {
    cleanup();
  });

  it('뒤로가기와 제목 자리를 바로 그리고, 데이터 블록은 아직 그리지 않는다', () => {
    render(<MemberDetailScreen storeId="s1" memberId="m1" />);
    expect(screen.getByRole('link', { name: '뒤로 가기, 직원' }).getAttribute('href')).toBe('/owner/s1/members');
    // 이름이 오기 전에도 같은 줄 높이를 잡는 제목
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(' ');
    expect(screen.queryByRole('heading', { name: '근로조건' })).toBeNull();
  });
});
