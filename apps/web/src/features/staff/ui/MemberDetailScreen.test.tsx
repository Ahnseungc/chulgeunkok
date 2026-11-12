/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { MemberDetailDto } from '../model/member-types';

import MemberDetailScreen from './MemberDetailScreen';

const push = vi.fn();
// 기본은 조회가 끝나지 않은 채(push 직후 슬라이드 중) 화면을 본다
const apiFetch = vi.fn((_path: string, _init?: RequestInit): Promise<unknown> => new Promise(() => {}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));
vi.mock('@/shared/lib/api-client', () => ({
  apiFetch: (path: string, init?: RequestInit) => apiFetch(path, init),
  ApiRequestError: class ApiRequestError extends Error {},
}));

const MEMBER: MemberDetailDto = {
  memberId: 'm1',
  name: '이알바',
  role: 'EMPLOYEE',
  status: 'ACTIVE',
  joinedAt: '2026-11-01T00:00:00Z',
  leftAt: null,
  isWorking: false,
  hasTerms: true,
  openReviewCount: 0,
  permissions: [],
  currentTerms: null,
  termsAccess: 'ALLOWED',
  canEditTerms: false,
  canViewHistory: false,
};

const serveMember = (member: MemberDetailDto) =>
  apiFetch.mockImplementation((path: string) =>
    path.endsWith('/members/m1') ? Promise.resolve(member) : new Promise(() => {}),
  );

// Seed ActionButton 의 눌림 피드백이 ResizeObserver 를 쓴다. jsdom 엔 없어서 빈 구현을 둔다
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

afterEach(() => {
  cleanup();
  apiFetch.mockReset();
  apiFetch.mockImplementation(() => new Promise(() => {}));
});

describe('MemberDetailScreen 조회 중', () => {
  it('뒤로가기와 제목 자리를 바로 그리고, 데이터 블록은 아직 그리지 않는다', () => {
    render(<MemberDetailScreen storeId="s1" memberId="m1" />);
    expect(screen.getByRole('link', { name: '뒤로 가기, 직원' }).getAttribute('href')).toBe('/owner/s1/members');
    // 이름이 오기 전에도 같은 줄 높이를 잡는 제목
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(' ');
    expect(screen.queryByRole('heading', { name: '근로조건' })).toBeNull();
  });
});

describe('MemberDetailScreen 근로조건 구역 (auth §4.2)', () => {
  it('휴대폰 인증 전 급여 권한 매니저에게는 인증 안내를 띄우고, 누르면 지금 화면으로 돌아오는 인증으로 보낸다', async () => {
    serveMember({ ...MEMBER, termsAccess: 'PHONE_VERIFICATION_REQUIRED' });
    window.history.pushState({}, '', '/owner/s1/members/m1');
    render(<MemberDetailScreen storeId="s1" memberId="m1" />);
    fireEvent.click(await screen.findByRole('button', { name: '휴대폰 인증하기' }));
    expect(screen.getByText('근로조건을 보려면 휴대폰 인증이 필요해요.')).toBeTruthy();
    expect(screen.queryByText('근로조건은 사장님이나 권한 있는 매니저만 볼 수 있어요.')).toBeNull();
    expect(push).toHaveBeenCalledWith('/owner/login?verify=1&next=%2Fowner%2Fs1%2Fmembers%2Fm1');
    // 검토 안내도 같은 규칙이라 불러오지 않는다
    expect(apiFetch).not.toHaveBeenCalledWith('/api/v1/stores/s1/members/m1/labor-reviews', undefined);
  });

  it('권한이 없는 매니저에게는 볼 수 없다는 안내만', async () => {
    serveMember({ ...MEMBER, termsAccess: 'FORBIDDEN' });
    render(<MemberDetailScreen storeId="s1" memberId="m1" />);
    expect(await screen.findByText('근로조건은 사장님이나 권한 있는 매니저만 볼 수 있어요.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '휴대폰 인증하기' })).toBeNull();
  });
});
