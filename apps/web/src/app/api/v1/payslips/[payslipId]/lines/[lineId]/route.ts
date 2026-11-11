import { UpdatePayslipLineBody } from '@/features/payslip/schema';
import { deletePayslipLine, upsertPayslipLine } from '@/features/payslip/server/payslip-edit-service';
import { db } from '@/server/db';
import { defineRoute } from '@/server/http/define-route';

type Params = { payslipId: string; lineId: string };

/** PUT /api/v1/payslips/:payslipId/lines/:lineId — 금액 수정, 계산값과 다르면 사유 필수 (docs/specs/payslip/README.md §4.2·§7) */
export const PUT = defineRoute<typeof UpdatePayslipLineBody._output, undefined, Params>(
  { body: UpdatePayslipLineBody },
  async ({ params, body, userId }) =>
    upsertPayslipLine(db, { payslipId: params.payslipId, lineId: params.lineId, actorUserId: userId, body }),
);

/** DELETE /api/v1/payslips/:payslipId/lines/:lineId — CUSTOM 줄만 (docs/specs/payslip/README.md §7) */
export const DELETE = defineRoute<undefined, undefined, Params>({}, async ({ params, userId }) =>
  deletePayslipLine(db, { payslipId: params.payslipId, lineId: params.lineId, actorUserId: userId }),
);
