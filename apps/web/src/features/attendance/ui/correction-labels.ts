import type { CorrectionStatus, CorrectionType } from '../model/attendance-admin-types';

export const CORRECTION_TYPE_LABEL = {
  TIME: '시각 수정',
  BREAK_WAIVED: '휴게 못 함',
  MISSING_CLOCK_OUT: '퇴근 시각 입력',
} as const satisfies Record<CorrectionType, string>;

export const CORRECTION_STATUS_LABEL = {
  PENDING: '확인 중',
  APPROVED: '승인됨',
  REJECTED: '반려됨',
  CANCELED: '취소함',
} as const satisfies Record<CorrectionStatus, string>;
