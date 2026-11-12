import type { PayPeriod } from '@/features/payroll/model/work-time';

import type { HeadcountEstimate, HeadcountMismatch } from './headcount-estimate';

export type HeadcountBandValue = 'UNDER_5' | 'FIVE_OR_MORE' | 'UNKNOWN';

/** GET /stores/:storeId/settings 응답. docs/specs/store §4~6 */
export interface StoreSettingsDto {
  id: string;
  name: string;
  address: string | null;
  payPeriod: {
    currentStartDay: number;
    /** 다음 기간부터 바뀔 예정인 시작일 */
    pendingChange: { startDay: number; effectiveFrom: string } | null;
    currentPeriod: PayPeriod;
  };
  /** 급여 지급일 (1~31). 없으면 명세서마다 지급일을 넣는다 (docs/specs/payslip §3.4) */
  payDay: number | null;
  headcount: {
    current: HeadcountBandValue;
    history: { band: HeadcountBandValue; effectiveFrom: string; declaredByName: string; note: string | null }[];
  };
  /** 직전 달 출근 기록 참고 추정치. 가동일이 없으면 null (docs/specs/store §6.4) */
  headcountEstimate: (HeadcountEstimate & { month: string; mismatch: HeadcountMismatch | null }) | null;
  /** 지금 쓰는 매장 QR 발급 시각 */
  qrIssuedAt: string | null;
}

export const HEADCOUNT_LABEL = {
  UNDER_5: '5인 미만',
  FIVE_OR_MORE: '5인 이상',
  UNKNOWN: '잘 모르겠어요',
} as const satisfies Record<HeadcountBandValue, string>;
