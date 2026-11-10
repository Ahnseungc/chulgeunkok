import type { AllowanceEstimate } from './allowances';
import type { PeriodWithNav } from './work-time';

/** GET /stores/:storeId/payroll/preview 응답. 정본: docs/specs/payroll §4 */
export interface PayrollMemberDto {
  memberId: string;
  name: string;
  status: 'ACTIVE' | 'INACTIVE';
  recognizedSeconds: number;
  basePayEstimate: number;
  byWage: { hourlyWage: number; recognizedSeconds: number }[];
  /** 예상 주휴·가산수당 (docs/specs/payroll §3.6) */
  allowances: AllowanceEstimate;
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
  /** 기간 마지막 날(오늘까지) 기준 사업장 규모 신고값. 가산수당 안내 문구용 */
  headcountBand: 'UNDER_5' | 'FIVE_OR_MORE' | 'UNKNOWN';
  totals: { recognizedSeconds: number; basePayEstimate: number; allowanceEstimate: number; memberCount: number };
  members: PayrollMemberDto[];
  unresolved: { missingClockOut: number; pendingCorrections: number; openLaborReviews: number };
}

/** 정산 화면 하단 고지 (docs/specs/payroll §6) */
export const PAYROLL_DISCLAIMER = '예상 금액이에요. 공제는 빠져 있고, 주휴수당은 끝난 주만 넣었어요.';
/** 가산수당을 계산하지 않은 기간 안내 (PRD §5.6) */
export const PREMIUM_NOT_APPLIED_NOTE = {
  UNDER_5: '5인 미만 사업장은 연장·야간·휴일 가산수당을 넣지 않았어요.',
  UNKNOWN: '사업장 규모를 알려주시면 가산수당도 계산해 드려요.',
  FIVE_OR_MORE: null,
} as const;

/** 원 단위 금액 표시 `80,000원` */
export const formatWon = (amount: number) => `${amount.toLocaleString('ko-KR')}원`;

const ALLOWANCE_LABELS = [
  ['주휴', 'weeklyHolidayPay'],
  ['연장', 'overtimePremium'],
  ['야간', 'nightPremium'],
  ['휴일', 'holidayPremium'],
] as const;

/** 0원이 아닌 주휴·가산 항목만 "주휴 80,000원 · 연장 10,000원" */
export const formatAllowanceBreakdown = (allowances: AllowanceEstimate) =>
  ALLOWANCE_LABELS.filter(([, key]) => allowances[key] > 0)
    .map(([label, key]) => `${label} ${formatWon(allowances[key])}`)
    .join(' · ');
