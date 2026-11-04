import type { PeriodWithNav } from './work-time';

/** GET /stores/:storeId/payroll/preview 응답. 정본: docs/specs/payroll §4 */
export interface PayrollMemberDto {
  memberId: string;
  name: string;
  status: 'ACTIVE' | 'INACTIVE';
  recognizedSeconds: number;
  basePayEstimate: number;
  byWage: { hourlyWage: number; recognizedSeconds: number }[];
  /** 정산에 들어간(CLOSED) 근무 수 */
  attendanceCount: number;
  /** 근무한 날 수 (매장 시간대 출근 날짜 기준) */
  workDays: number;
  flags: {
    openCount: number;
    missingClockOutCount: number;
    pendingCorrectionCount: number;
    breakNotScheduledCount: number;
    openLaborReviewCount: number;
  };
}

export interface PayrollPreviewDto {
  period: PeriodWithNav;
  totals: { recognizedSeconds: number; basePayEstimate: number; memberCount: number };
  members: PayrollMemberDto[];
  unresolved: { missingClockOut: number; pendingCorrections: number; openLaborReviews: number };
}

/** 정산 화면 하단 고지 (docs/specs/payroll §6) */
export const PAYROLL_DISCLAIMER = '예상 금액이에요. 주휴·가산수당과 공제는 빠져 있어요.';
