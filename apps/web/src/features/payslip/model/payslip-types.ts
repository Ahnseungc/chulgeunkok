/** 임금명세서 계산 모델·응답 타입. 정본: docs/specs/payslip §3·§7 */

import type { DeductionTypeValue } from '@/features/labor/model/labor-types';
import type { PeriodWithNav } from '@/features/payroll/model/work-time';

/** 지급 항목 code. 줄 순서이기도 하다 (§3.2). 사장님이 추가한 줄은 `CUSTOM` */
export const EARNING_CODES = [
  'BASE_PAY',
  'WEEKLY_HOLIDAY_PAY',
  'OVERTIME_PREMIUM',
  'NIGHT_PREMIUM',
  'HOLIDAY_PREMIUM',
  'PAID_HOLIDAY_PAY',
] as const;

/** 4대보험 공제 줄 code. 줄 순서이기도 하다 (§3.3) */
export const SOCIAL_INSURANCE_CODES = [
  'NATIONAL_PENSION',
  'HEALTH_INSURANCE',
  'LONG_TERM_CARE',
  'EMPLOYMENT_INSURANCE',
  'INCOME_TAX',
  'LOCAL_INCOME_TAX',
] as const;

/** 사장님이 직접 추가한 줄 code (§3.2) */
export const CUSTOM_CODE = 'CUSTOM';

/** PayslipLine 한 줄의 계산 결과 (DB 저장 전 형태) */
export interface LineDraft {
  kind: 'EARNING' | 'DEDUCTION';
  code: string;
  label: string;
  basis: string;
  /** 자동 계산값. 수기 공제·CUSTOM 줄은 null */
  calculatedAmount: number | null;
  amount: number;
  /** 사장님이 계산값 대신 고친 사유. 없으면 null */
  adjustReason: string | null;
  sortOrder: number;
}

/** 명세서 근로일수·시간 요약 (§3.1) */
export interface PayslipSummary {
  workDays: number;
  recognizedSeconds: number;
  overtimeSeconds: number;
  nightSeconds: number;
  holidaySeconds: number;
}

export interface PayslipTotals {
  grossPay: number;
  totalDeduction: number;
  netPay: number;
}

export type PayslipStatusValue = 'DRAFT' | 'SENT' | 'SUPERSEDED';

/** 저장된 줄 (id 포함) */
export type PayslipLineDto = LineDraft & { id: string };

export interface PayslipListItemDto {
  payslipId: string;
  memberId: string;
  name: string;
  version: number;
  status: PayslipStatusValue;
  netPay: number;
  /** 없으면 보내기 전에 넣어야 한다 (§3.4) */
  payDate: string | null;
  /** 직원이 한 번이라도 열었는지 */
  viewed: boolean;
  /** 직원 기기에 푸시 토큰이 하나라도 있는지. 없으면 "알림 미수신" 배지 (§5.1) */
  pushEnabled: boolean;
  /** version 2 이상 (정정본) */
  isCorrection: boolean;
  /** 기간 안 퇴근 누락 + 대기 중 수정 요청 수. 0이 아니면 배지 (§4.3) */
  unresolvedCount: number;
}

export interface PayslipListDto {
  period: PeriodWithNav;
  /** draft = 확인 필요(v1 DRAFT), sent = 보냄, correction = 정정본 확인 필요 (§5.1) */
  counts: { draft: number; sent: number; correction: number };
  items: PayslipListItemDto[];
}

export interface PayslipDetailDto {
  id: string;
  storeId: string;
  /** 매장명 (직원 화면 표시용, §5.3) */
  storeName: string;
  membershipId: string;
  periodStart: string;
  /** 미포함 */
  periodEnd: string;
  version: number;
  status: PayslipStatusValue;
  payDate: string | null;
  employeeName: string;
  employeeNumber: number;
  workDays: number;
  recognizedSeconds: number;
  overtimeSeconds: number;
  nightSeconds: number;
  holidaySeconds: number;
  deductionType: DeductionTypeValue;
  grossPay: number;
  totalDeduction: number;
  netPay: number;
  correctionNote: string | null;
  sentAt: string | null;
  viewedAt: string | null;
  lines: PayslipLineDto[];
  /** DRAFT의 기간 안 퇴근 누락 + 대기 중 수정 요청 수. 보낸 명세서는 0 (§4.3·§5.2) */
  unresolvedCount: number;
  /** 정정본이면 같은 기간 직전 보낸 본 (그 안의 previousSent는 null) */
  previousSent: PayslipDetailDto | null;
}

export interface MyPayslipListItemDto {
  payslipId: string;
  periodStart: string;
  periodEnd: string;
  version: number;
  status: PayslipStatusValue;
  payDate: string | null;
  netPay: number;
  sentAt: string | null;
  viewed: boolean;
  isCorrection: boolean;
}
