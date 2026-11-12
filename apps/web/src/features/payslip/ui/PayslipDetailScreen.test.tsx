/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ERROR_CODES } from '@/server/http/error-codes';
import ToastProvider from '@/shared/ui/Toast';

import type { PayslipDetailDto, PayslipLineDto } from '../model/payslip-types';

import { SEND_BLOCK_MESSAGE } from './payslip-labels';
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
  storeName: '골목카페',
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
  unresolvedCount: 0,
  previousSent: null,
  ...overrides,
});

const respondWith = (body: unknown) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => body })),
  );

const renderScreen = () =>
  render(
    <ToastProvider>
      <PayslipDetailScreen storeId="s1" payslipId="p1" />
    </ToastProvider>,
  );

const correction = () => {
  const previous = detail({ id: 'p0', status: 'SENT', sentAt: '2026-12-02T01:00:00Z' });
  return detail({ version: 2, previousSent: { ...previous, previousSent: null } });
};

describe('PayslipDetailScreen', () => {
  beforeEach(() => {
    stubResizeObserver();
    // jsdom 엔 showModal·scrollIntoView 가 없다
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    };
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('계산값과 다르면 계산값 보조 표시', async () => {
    respondWith(detail({ lines: [{ ...basePay, amount: 500_000, adjustReason: '합의한 금액' }], grossPay: 500_000, netPay: 500_000 }));
    renderScreen();
    expect(await screen.findByText('계산값 469,560원')).toBeTruthy();
    expect(screen.getByRole('button', { name: '기본급 500,000원 고치기' })).toBeTruthy();
  });

  it('지급일 없이 보내기를 누르면 시트 대신 토스트 + 지급일 칸 포커스', async () => {
    respondWith(detail({ payDate: null }));
    renderScreen();
    const payDate = await screen.findByLabelText('지급일');
    fireEvent.click(screen.getByRole('button', { name: '보내기' }));
    expect((await screen.findByRole('status')).textContent).toBe('급여 지급일을 넣어 주세요.');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(payDate);
  });

  it('정정본을 사유 없이 보내려 하면 토스트 + 사유 칸 포커스', async () => {
    respondWith(correction());
    renderScreen();
    const note = await screen.findByLabelText('정정 사유 (직원에게 보여요)');
    fireEvent.click(screen.getByRole('button', { name: '보내기' }));
    expect((await screen.findByRole('status')).textContent).toBe('정정 사유를 적어 주세요.');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(note);
  });

  it('공제가 지급보다 많으면 시트를 열지 않는다', async () => {
    respondWith(detail({ totalDeduction: 500_000, netPay: -30_440 }));
    renderScreen();
    await screen.findByLabelText('지급일');
    fireEvent.click(screen.getByRole('button', { name: '보내기' }));
    expect((await screen.findByRole('status')).textContent).toBe('공제가 지급액보다 많아요.');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('검사를 통과하면 확인 시트, 보내면 성공 토스트', async () => {
    respondWith(detail());
    renderScreen();
    await screen.findByLabelText('지급일');
    fireEvent.click(screen.getByRole('button', { name: '보내기' }));
    const sheet = screen.getByRole('dialog', { name: '이알바님에게 보낼까요?' });
    fireEvent.click(within(sheet).getByRole('button', { name: '보내기' }));
    expect((await screen.findByRole('status')).textContent).toBe('보냈어요');
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).endsWith('/api/v1/payslips/p1/send'))).toBe(true);
  });

  it('보내기 전 검사 문구는 서버 에러 코드 문구와 같다', () => {
    expect(SEND_BLOCK_MESSAGE.payDateRequired).toBe(ERROR_CODES.PAYSLIP_PAY_DATE_REQUIRED.message);
    expect(SEND_BLOCK_MESSAGE.netNegative).toBe(ERROR_CODES.PAYSLIP_NET_NEGATIVE.message);
    expect(SEND_BLOCK_MESSAGE.correctionNoteRequired).toBe(ERROR_CODES.PAYSLIP_CORRECTION_NOTE_REQUIRED.message);
  });

  it('미해결 근태가 있으면 경고 줄을 보여 준다', async () => {
    respondWith(detail({ unresolvedCount: 2 }));
    renderScreen();
    expect((await screen.findByRole('note')).textContent).toContain('미해결 근태 2건');
  });
});
