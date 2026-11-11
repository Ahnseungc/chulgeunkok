/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DashboardDto } from '../model/dashboard-types';

import TodoCards from './TodoCards';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, replace: () => {} }) }));

const todo = (overrides: Partial<DashboardDto['todo']>): DashboardDto['todo'] => ({
  termsMissing: 0,
  missingClockOut: 0,
  pendingCorrections: 0,
  laborReviews: null,
  pendingInvitations: 0,
  payslipDrafts: null,
  payslipDraftPeriodStart: null,
  ...overrides,
});

describe('TodoCards', () => {
  afterEach(() => cleanup());

  it('명세서 확인 카드는 가장 오래된 DRAFT 기간을 연다 (docs/specs/payslip §5.1)', () => {
    render(<TodoCards storeId="s1" todo={todo({ payslipDrafts: 3, payslipDraftPeriodStart: '2026-09-01' })} />);
    const link = screen.getByText('명세서 확인 3건').closest('a');
    expect(link?.getAttribute('href')).toBe('/owner/s1/payslips?periodStart=2026-09-01');
  });
});
