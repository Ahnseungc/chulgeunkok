import { AddPayslipLineBody } from '@/features/payslip/schema';
import { addPayslipLine } from '@/features/payslip/server/payslip-edit-service';
import { db } from '@/server/db';
import { defineRoute } from '@/server/http/define-route';

/** POST /api/v1/payslips/:payslipId/lines — CUSTOM 줄 추가 (docs/specs/payslip/README.md §4.2·§7) */
export const POST = defineRoute<typeof AddPayslipLineBody._output, undefined, { payslipId: string }>(
  { body: AddPayslipLineBody },
  async ({ params, body, userId }) => addPayslipLine(db, { payslipId: params.payslipId, actorUserId: userId, body }),
);
