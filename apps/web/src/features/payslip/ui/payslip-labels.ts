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

/**
 * 보내기 전 클라이언트 검사 문구. 서버 `ERROR_CODES` 의 PAYSLIP_* 와 같아야 한다 (ui 는 server 를 import 하지 않아 테스트로 맞춘다)
 */
export const SEND_BLOCK_MESSAGE = {
  payDateRequired: '급여 지급일을 넣어 주세요.',
  netNegative: '공제가 지급액보다 많아요.',
  correctionNoteRequired: '정정 사유를 적어 주세요.',
  /** 일괄 보내기 대상에 지급일 없는 명세서가 섞였을 때 */
  bulkPayDateMissing: '지급일이 없는 명세서가 있어요. 명세서에서 지급일을 넣어 주세요.',
} as const;
