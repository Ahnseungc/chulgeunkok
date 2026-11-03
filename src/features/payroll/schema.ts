import { z } from 'zod';

import { LocalDate } from '@/shared/schema/common';

/** docs/specs/payroll §4 — 생략 시 현재 정산 기간 */
export const PayrollPreviewQuery = z.object({ periodStart: LocalDate.optional() });

export const MyPayrollQuery = PayrollPreviewQuery.extend({ storeId: z.string().min(1) });

/** docs/specs/payroll §5 — `detail=1`이면 근무별 상세 */
export const PayrollExportQuery = PayrollPreviewQuery.extend({
  detail: z.enum(['0', '1']).default('0').transform((value) => value === '1'),
});
