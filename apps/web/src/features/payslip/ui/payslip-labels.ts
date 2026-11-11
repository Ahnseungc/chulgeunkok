import type { PayslipStatusValue } from '../model/payslip-types';

/** 목록·상세 상태 칩 (docs/specs/payslip §5.1) */
export function payslipChipOf(payslip: { status: PayslipStatusValue; version: number }): { label: string; className: string } {
  if (payslip.status === 'SENT') return { label: '보냄', className: 'badge badge--positive' };
  if (payslip.status === 'SUPERSEDED') return { label: '이전 버전', className: 'badge' };
  return payslip.version > 1
    ? { label: '정정본 확인 필요', className: 'badge badge--warning' }
    : { label: '확인 필요', className: 'badge badge--warning' };
}

export const LINE_KIND_LABEL = { EARNING: '지급', DEDUCTION: '공제' } as const;
