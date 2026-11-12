/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { MembershipEventDto } from '../model/member-types';

import MemberHistorySection from './MemberHistorySection';

const apiFetch = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock('@/shared/lib/api-client', () => ({
  apiFetch: (path: string) => apiFetch(path),
  ApiRequestError: class ApiRequestError extends Error {},
}));

const EVENTS: MembershipEventDto[] = [
  {
    id: 'e2',
    type: 'PERMISSIONS_CHANGED',
    before: { permissions: [] },
    after: { permissions: ['PAYROLL_READ'] },
    actorName: '김사장',
    createdAt: '2026-11-04T01:30:00Z',
  },
  {
    id: 'e1',
    type: 'ROLE_CHANGED',
    before: { role: 'EMPLOYEE' },
    after: { role: 'MANAGER' },
    actorName: '김사장',
    createdAt: '2026-11-04T01:00:00Z',
  },
];

describe('MemberHistorySection', () => {
  afterEach(() => {
    cleanup();
    apiFetch.mockReset();
  });

  it('서버가 준 순서(최근 것 먼저)대로 문장·시각·바꾼 사람을 보여 준다', async () => {
    apiFetch.mockResolvedValue({ events: EVENTS });
    render(<MemberHistorySection memberPath="/api/v1/stores/s1/members/m1" />);
    const items = await screen.findAllByRole('listitem');
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/stores/s1/members/m1/events');
    expect(items.map((item) => item.textContent)).toEqual([
      '맡긴 권한: 없음 → 급여 보기11. 4. (수) 10:30 · 김사장',
      '역할을 직원에서 매니저로 바꿨어요11. 4. (수) 10:00 · 김사장',
    ]);
  });

  it('이력이 없으면 빈 안내', async () => {
    apiFetch.mockResolvedValue({ events: [] });
    render(<MemberHistorySection memberPath="/api/v1/stores/s1/members/m1" />);
    expect(await screen.findByText('아직 바꾼 내용이 없어요.')).toBeTruthy();
  });
});
