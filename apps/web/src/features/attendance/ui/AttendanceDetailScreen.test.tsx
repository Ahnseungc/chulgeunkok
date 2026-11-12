/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AttendanceDetailDto } from '../model/attendance-admin-types';

import AttendanceDetailScreen from './AttendanceDetailScreen';

const router = vi.hoisted(() => ({ push: () => {}, replace: () => {}, back: () => {} }));
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/owner/s1/attendances/a1' }));

const DETAIL: AttendanceDetailDto = {
  id: 'a1', memberId: 'm1', name: '이알바', localDate: '2026-11-02',
  clockInAt: '2026-11-02T09:00:00.000Z', clockOutAt: '2026-11-02T14:00:00.000Z', status: 'CLOSED',
  outsideArea: null, breakWaived: false, revised: false,
  workedSeconds: 5 * 3600, breakSeconds: 25 * 60, recognizedSeconds: 5 * 3600 - 25 * 60, breakNotScheduled: false,
  breaks: [
    { id: 'b1', startAt: '2026-11-02T11:00:00.000Z', endAt: '2026-11-02T11:20:00.000Z' },
    { id: 'b2', startAt: '2026-11-02T12:00:00.000Z', endAt: '2026-11-02T12:05:00.000Z' },
  ],
  revisions: [], corrections: [],
};

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => DETAIL })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('AttendanceDetailScreen 휴게 기록 (attendance §3.6)', () => {
  it('직원이 남긴 휴게 시각과 합계를 보여 준다 (읽기 전용)', async () => {
    render(<AttendanceDetailScreen storeId="s1" attendanceId="a1" />);
    const section = await screen.findByRole('region', { name: '휴게 기록' });
    expect(within(section).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      '20:00 ~ 20:20 · 20분',
      '21:00 ~ 21:05 · 5분',
    ]);
    expect(within(section).getByText('합계 25분')).toBeTruthy();
    expect(within(section).queryByRole('button')).toBeNull();
  });
});
