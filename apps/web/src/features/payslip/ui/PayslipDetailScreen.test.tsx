/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PayslipDetailDto, PayslipLineDto } from '../model/payslip-types';

import PayslipDetailScreen from './PayslipDetailScreen';

// 렌더마다 새 router 를 주면 useApiResource 가 매번 다시 조회한다. 같은 객체를 돌려준다
const router = vi.hoisted(() => ({ push: () => {}, replace: () => {} }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

// Seed ActionButton 의 눌림 피드백이 ResizeObserver 를 쓴다. jsdom 엔 없어서 빈 구현을 둔다 (afterEach 에서 함께 풀린다)
const stubResizeObserver = () =>
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );

const basePay: PayslipLineDto = {
  id: 'l1',
  kind: 'EARNING',
  code: 'BASE_PAY',
  label: '기본급',
  basis: '45시간 30분 × 10,320원',
  calculatedAmount: 469_560,
  amount: 469_560,
  adjustReason: null,
  sortOrder: 0,
};

const detail = (overrides: Partial<PayslipDetailDto> = {}): PayslipDetailDto => ({
  id: 'p1',
  storeId: 's1',
  membershipId: 'm1',
  periodStart: '2026-11-01',
  periodEnd: '2026-12-01',
  version: 1,
  status: 'DRAFT',
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
  sentAt: null,
  viewedAt: null,
  lines: [basePay],
  previousSent: null,
  ...overrides,
});

const respondWith = (body: unknown) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => body })),
  );

describe('PayslipDetailScreen', () => {
  beforeEach(() => {
    stubResizeObserver();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('계산값과 다르면 계산값 보조 표시', async () => {
    respondWith(detail({ lines: [{ ...basePay, amount: 500_000, adjustReason: '합의한 금액' }], grossPay: 500_000, netPay: 500_000 }));
    render(<PayslipDetailScreen storeId="s1" payslipId="p1" />);
    expect(await screen.findByText('계산값 469,560원')).toBeTruthy();
    expect(screen.getByRole('button', { name: '기본급 500,000원 고치기' })).toBeTruthy();
  });

  it('정정본이면 사유 입력 전 보내기 비활성', async () => {
    const previous = detail({ id: 'p0', status: 'SENT', sentAt: '2026-12-02T01:00:00Z' });
    respondWith(detail({ version: 2, previousSent: { ...previous, previousSent: null } }));
    render(<PayslipDetailScreen storeId="s1" payslipId="p1" />);
    const note = await screen.findByLabelText('정정 사유 (직원에게 보여요)');
    const send = screen.getByRole('button', { name: '보내기' });
    expect(send.hasAttribute('disabled')).toBe(true);
    fireEvent.change(note, { target: { value: '11/2 퇴근 시각을 고쳤어요' } });
    expect(send.hasAttribute('disabled')).toBe(false);
  });
});
