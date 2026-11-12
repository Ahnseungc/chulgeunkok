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
  headcountMismatch: null,
  ...overrides,
});

describe('TodoCards', () => {
  afterEach(() => cleanup());

  it('명세서 확인 카드는 가장 오래된 DRAFT 기간을 연다 (docs/specs/payslip §5.1)', () => {
    render(<TodoCards storeId="s1" todo={todo({ payslipDrafts: 3, payslipDraftPeriodStart: '2026-09-01' })} />);
    const link = screen.getByText('명세서 확인 3건').closest('a');
    expect(link?.getAttribute('href')).toBe('/owner/s1/payslips?periodStart=2026-09-01');
  });

  it('규모 불일치면 설정으로 가는 카드를 보여 준다 (docs/specs/store §6.4)', () => {
    render(<TodoCards storeId="s1" todo={todo({ headcountMismatch: 'MAYBE_FIVE_OR_MORE' })} />);
    const link = screen.getByText('사업장 규모 확인').closest('a');
    expect(link?.getAttribute('href')).toBe('/owner/s1/settings');
    expect(screen.getByText('지난달 출근 기록으로는 5인 이상일 수 있어요. 자동으로 바뀌지 않아요')).toBeTruthy();
  });

  it('불일치가 없으면 카드가 없다', () => {
    render(<TodoCards storeId="s1" todo={todo({})} />);
    expect(screen.queryByText('사업장 규모 확인')).toBeNull();
  });
});
