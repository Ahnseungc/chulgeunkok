/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MyPayslipListItemDto, PayslipDetailDto } from '../model/payslip-types';

import MyPayslipDetailScreen from './MyPayslipDetailScreen';
import MyPayslipsScreen from './MyPayslipsScreen';

const router = vi.hoisted(() => ({ push: () => {}, replace: () => {} }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const stubResizeObserver = () =>
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );

const item = (overrides: Partial<MyPayslipListItemDto>): MyPayslipListItemDto => ({
  payslipId: 'p1',
  periodStart: '2026-11-01',
  periodEnd: '2026-12-01',
  version: 1,
  status: 'SENT',
  payDate: '2026-12-10',
  netPay: 469_560,
  sentAt: '2026-12-02T01:00:00Z',
  viewed: false,
  isCorrection: false,
  ...overrides,
});

const detail = (overrides: Partial<PayslipDetailDto> = {}): PayslipDetailDto => ({
  id: 'p1',
  storeId: 's1',
  storeName: '골목카페',
  membershipId: 'm1',
  periodStart: '2026-11-01',
  periodEnd: '2026-12-01',
  version: 1,
  status: 'SENT',
  payDate: '2026-12-10',
  employeeName: '이알바',
  employeeNumber: 2,
  workDays: 9,
  recognizedSeconds: 45.5 * 3600,
  overtimeSeconds: 0,
  nightSeconds: 0,
  holidaySeconds: 0,
  deductionType: 'NONE',
  grossPay: 469_560,
  totalDeduction: 0,
  netPay: 469_560,
  correctionNote: null,
  sentAt: '2026-12-02T01:00:00Z',
  viewedAt: null,
  lines: [],
  unresolvedCount: 0,
  previousSent: null,
  ...overrides,
});

const respondWith = (body: unknown) => {
  const mock = vi.fn(async (_url: string, init?: RequestInit) => ({ ok: true, json: async () => (init?.method === 'POST' ? {} : body) }));
  vi.stubGlobal('fetch', mock);
  return mock;
};

describe('직원 임금명세서 화면', () => {
  beforeEach(() => {
    stubResizeObserver();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('정정본은 사유를 위에 보여 준다', async () => {
    respondWith(detail({ version: 2, correctionNote: '11/2 퇴근 시각을 고쳤어요' }));
    render(<MyPayslipDetailScreen payslipId="p1" />);
    expect(await screen.findByText('정정 사유: 11/2 퇴근 시각을 고쳤어요')).toBeTruthy();
  });

  it('이전 버전은 접혀 있다', async () => {
    respondWith({ items: [item({ payslipId: 'p2', version: 2, isCorrection: true }), item({ payslipId: 'p1', status: 'SUPERSEDED', netPay: 111_000 })] });
    render(<MyPayslipsScreen storeId="s1" />);
    const toggle = await screen.findByRole('button', { name: '이전 버전 1개 보기' });
    expect(screen.queryByText('실지급 111,000원')).toBeNull();
    fireEvent.click(toggle);
    expect(await screen.findByText('실지급 111,000원')).toBeTruthy();
  });

  it('퇴사자만 있어도 storeId 없이 열면 그 매장 명세서를 보여 준다', async () => {
    const mock = vi.fn(async (url: string) => ({
      ok: true,
      json: async () =>
        url === '/api/v1/me' ? { memberships: [{ storeId: 's9', status: 'INACTIVE' }] } : { items: [item({ netPay: 222_000 })] },
    }));
    vi.stubGlobal('fetch', mock);
    render(<MyPayslipsScreen />);
    expect(await screen.findByText('실지급 222,000원')).toBeTruthy();
    expect(mock).toHaveBeenCalledWith('/api/v1/attendance/me/payslips?storeId=s9', expect.anything());
  });

  it('소속이 없으면 빈 안내를 보여 준다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ memberships: [] }) })));
    render(<MyPayslipsScreen />);
    expect(await screen.findByText('아직 받은 명세서가 없어요')).toBeTruthy();
  });

  it('상세를 열면 열람 요청을 한 번 보낸다', async () => {
    const mock = respondWith(detail());
    const { rerender } = render(<MyPayslipDetailScreen payslipId="p1" />);
    await screen.findByText('지급일');
    rerender(<MyPayslipDetailScreen payslipId="p1" />);
    const views = mock.mock.calls.filter(([url, init]) => url === '/api/v1/payslips/p1/view' && init?.method === 'POST');
    expect(views).toHaveLength(1);
  });
});
