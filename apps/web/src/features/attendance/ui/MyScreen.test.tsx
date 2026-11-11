/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MeDto } from '@/features/auth/model/me-types';
import type { MyPayslipListItemDto } from '@/features/payslip/model/payslip-types';

import MyScreen from './MyScreen';

const router = vi.hoisted(() => ({ push: () => {}, replace: () => {} }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const ME: MeDto = {
  user: { id: 'u1', name: '이알바', hasPhone: true },
  memberships: [{ storeId: 's9', storeName: '골목카페', role: 'EMPLOYEE', status: 'INACTIVE' }],
};

const PAYSLIP: MyPayslipListItemDto = {
  payslipId: 'p1',
  periodStart: '2026-10-01',
  periodEnd: '2026-11-01',
  version: 1,
  status: 'SENT',
  payDate: '2026-11-10',
  netPay: 222_000,
  sentAt: '2026-11-02T01:00:00Z',
  viewed: true,
  isCorrection: false,
};

describe('MyScreen 퇴사자', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => ({ ok: true, json: async () => (url === '/api/v1/me' ? ME : { items: [PAYSLIP] }) })),
    );
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('퇴사한 매장만 있으면 등록 안내 대신 명세서 안내를 보인다 (docs/specs/payslip §1-6)', async () => {
    render(<MyScreen />);
    expect(await screen.findByText('지금 다니는 매장이 없어요. 받은 임금명세서는 아래에서 볼 수 있어요.')).toBeTruthy();
    expect(screen.queryByText(/아직 소속된 매장이 없어요/)).toBeNull();
  });
});
