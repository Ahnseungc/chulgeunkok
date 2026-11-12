/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ToastProvider from '@/shared/ui/Toast';

import type { PayslipListDto, PayslipListItemDto } from '../model/payslip-types';

import PayslipsScreen from './PayslipsScreen';

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

const item = (overrides: Partial<PayslipListItemDto>): PayslipListItemDto => ({
  payslipId: 'p1',
  memberId: 'm1',
  name: '이알바',
  version: 1,
  status: 'DRAFT',
  netPay: 1_234_560,
  payDate: '2026-12-10',
  viewed: false,
  pushEnabled: true,
  isCorrection: false,
  unresolvedCount: 0,
  ...overrides,
});

const list = (items: PayslipListItemDto[]): PayslipListDto => ({
  period: { start: '2026-11-01', end: '2026-12-01', prevStart: '2026-10-01', nextStart: '2026-12-01' },
  counts: { draft: items.filter((row) => row.status === 'DRAFT' && !row.isCorrection).length, sent: 0, correction: 0 },
  items,
});

const respondWith = (body: unknown) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => body })),
  );

const renderScreen = (initialPeriodStart?: string) =>
  render(
    <ToastProvider>
      <PayslipsScreen storeId="s1" initialPeriodStart={initialPeriodStart} />
    </ToastProvider>,
  );

describe('PayslipsScreen', () => {
  beforeEach(() => {
    stubResizeObserver();
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    };
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('확인 필요 칩과 실지급액을 보여 준다', async () => {
    respondWith(list([item({})]));
    renderScreen();
    const row = (await screen.findByText('이알바')).closest('a');
    expect(row?.getAttribute('href')).toBe('/owner/s1/payslips/p1');
    expect(within(row as HTMLElement).getByText('확인 필요')).toBeTruthy();
    expect(within(row as HTMLElement).getByText('1,234,560원')).toBeTruthy();
  });

  it('확인 필요 모두 보내기는 확인 시트에 인원·총액', async () => {
    respondWith(
      list([
        item({}),
        item({ payslipId: 'p2', memberId: 'm2', name: '박신입', netPay: 500_000 }),
        item({ payslipId: 'p3', memberId: 'm3', name: '최보냄', status: 'SENT', netPay: 900_000 }),
      ]),
    );
    renderScreen();
    await screen.findByText('박신입');
    fireEvent.click(screen.getByRole('button', { name: '확인 필요 모두 보내기' }));
    const sheet = screen.getByRole('dialog');
    expect(within(sheet).getByText('2명 · 실지급 합계 1,734,560원')).toBeTruthy();
    expect(within(sheet).getByRole('button', { name: '보내기' }).hasAttribute('disabled')).toBe(false);
  });

  it('지급일 없는 대상이 있으면 시트 대신 토스트', async () => {
    respondWith(list([item({}), item({ payslipId: 'p2', memberId: 'm2', name: '박신입', payDate: null })]));
    renderScreen();
    await screen.findByText('박신입');
    fireEvent.click(screen.getByRole('button', { name: '확인 필요 모두 보내기' }));
    expect((await screen.findByRole('status')).textContent).toBe('지급일이 없는 명세서가 있어요. 명세서에서 지급일을 넣어 주세요.');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('모두 보내면 시트를 닫고 인원 토스트', async () => {
    const body = list([item({}), item({ payslipId: 'p2', memberId: 'm2', name: '박신입' })]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => ({ ok: true, json: async () => (url.endsWith('/payslips/send') ? { sent: 2 } : body) })),
    );
    renderScreen();
    await screen.findByText('박신입');
    fireEvent.click(screen.getByRole('button', { name: '확인 필요 모두 보내기' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '보내기' }));
    expect((await screen.findByRole('status')).textContent).toBe('2명에게 보냈어요');
  });

  it('미해결 근태가 있으면 배지와 보내기 시트 경고', async () => {
    respondWith(list([item({ unresolvedCount: 2 }), item({ payslipId: 'p2', memberId: 'm2', name: '박신입' })]));
    renderScreen();
    const row = (await screen.findByText('이알바')).closest('a');
    expect(within(row as HTMLElement).getByText('미해결 근태 2')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '확인 필요 모두 보내기' }));
    expect(within(screen.getByRole('dialog')).getByRole('note').textContent).toContain('1명에게');
  });

  it('급여 권한 매니저가 휴대폰 인증 전이면 문구와 인증 버튼을 보여 준다 (auth §4.2)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 403,
        json: async () => ({ error: { code: 'PHONE_VERIFICATION_REQUIRED', message: '급여를 보려면 휴대폰 인증이 필요해요.' } }),
      })),
    );
    renderScreen();
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('급여를 보려면 휴대폰 인증이 필요해요.')).toBeTruthy();
    expect(within(alert).getByRole('button', { name: '휴대폰 인증하기' })).toBeTruthy();
  });

  it('URL의 periodStart로 첫 기간을 연다', async () => {
    respondWith(list([item({})]));
    renderScreen('2026-09-01');
    await screen.findByText('이알바');
    const [url] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(String(url)).toContain('/api/v1/stores/s1/payslips?periodStart=2026-09-01');
  });
});
