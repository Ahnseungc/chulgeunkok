import { z } from 'zod';

import { LocalDate, Reason } from '@/shared/schema/common';

/** 줄 금액 상한 (원). 오타로 넣은 비정상 금액을 막는다 */
const MAX_LINE_AMOUNT = 100_000_000;
const MAX_LABEL_LENGTH = 30;
const MAX_BASIS_LENGTH = 200;
/** 한 번에 보낼 수 있는 명세서 수 */
const MAX_SEND_COUNT = 200;

const Amount = z.number().int().min(0).max(MAX_LINE_AMOUNT);

/** GET /stores/:storeId/payslips — docs/specs/payslip §7. 생략 시 끝난 최근 정산 기간 (§5.1) */
export const PayslipListQuery = z.object({ periodStart: LocalDate.optional() });

/** PATCH /payslips/:id — §7. deductionType이면 공제 줄 묶음을 새로 만든다 (§3.3) */
export const UpdatePayslipBody = z
  .object({
    payDate: LocalDate.optional(),
    correctionNote: Reason.optional(),
    deductionType: z.enum(['NONE', 'WITHHOLDING_3_3', 'SOCIAL_INSURANCE']).optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), '바꿀 값이 없어요.');

/** PUT /payslips/:id/lines/:lineId — §7. 계산값과 다르면 adjustReason 필수 (§4.2) */
export const UpdatePayslipLineBody = z.object({ amount: Amount, adjustReason: Reason.optional() });

/** POST /payslips/:id/lines — §7. 사장님이 추가하는 CUSTOM 줄 */
export const AddPayslipLineBody = z.object({
  kind: z.enum(['EARNING', 'DEDUCTION']),
  label: z.string().trim().min(1).max(MAX_LABEL_LENGTH),
  basis: z.string().trim().max(MAX_BASIS_LENGTH).default(''),
  amount: Amount,
});

/** POST /stores/:storeId/payslips/send — §7 */
export const SendPayslipsBody = z.object({ payslipIds: z.array(z.string().min(1)).min(1).max(MAX_SEND_COUNT) });

export type UpdatePayslipBody = z.output<typeof UpdatePayslipBody>;
export type UpdatePayslipLineBody = z.output<typeof UpdatePayslipLineBody>;
export type AddPayslipLineBody = z.output<typeof AddPayslipLineBody>;

/** GET /attendance/me/payslips — docs/specs/payslip §7 */
export const MyPayslipsQuery = z.object({ storeId: z.string().min(1) });
