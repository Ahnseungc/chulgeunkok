/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

describe('PayslipsScreen', () => {
  beforeEach(() => {
    stubResizeObserver();
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('확인 필요 칩과 실지급액을 보여 준다', async () => {
    respondWith(list([item({})]));
    render(<PayslipsScreen storeId="s1" />);
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
    render(<PayslipsScreen storeId="s1" />);
    await screen.findByText('박신입');
    fireEvent.click(screen.getByRole('button', { name: '확인 필요 모두 보내기' }));
    const sheet = screen.getByRole('dialog');
    expect(within(sheet).getByText('2명 · 실지급 합계 1,734,560원')).toBeTruthy();
    expect(within(sheet).getByRole('button', { name: '보내기' }).hasAttribute('disabled')).toBe(false);
  });
});
