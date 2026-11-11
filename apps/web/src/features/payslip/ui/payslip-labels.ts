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

/** 미해결 근태 배지 문구 (§4.3). 0이면 null */
export const unresolvedLabelOf = (count: number): string | null => (count > 0 ? `미해결 근태 ${count}` : null);

/** 상세·일괄 보내기 시트의 미해결 경고 문구 (§4.3) */
export const UNRESOLVED_WARNING = '퇴근 누락이나 대기 중인 수정 요청이 있어요. 처리하면 금액이 바뀔 수 있어요.';
