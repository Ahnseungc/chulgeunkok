import { UpdatePayslipBody } from '@/features/payslip/schema';
import { updatePayslip } from '@/features/payslip/server/payslip-edit-service';
import { getPayslip } from '@/features/payslip/server/payslip-query-service';
import { db } from '@/server/db';
import { defineRoute } from '@/server/http/define-route';

type Params = { payslipId: string };

/** GET /api/v1/payslips/:payslipId — Owner·PAYROLL_READ, 본인은 보낸 것만 (docs/specs/payslip/README.md §7) */
export const GET = defineRoute<undefined, undefined, Params>({}, async ({ params, userId }) =>
  getPayslip(db, { payslipId: params.payslipId, actorUserId: userId }),
);

/** PATCH /api/v1/payslips/:payslipId — 지급일·정정 사유·공제 방식 (docs/specs/payslip/README.md §3.3·§7) */
export const PATCH = defineRoute<typeof UpdatePayslipBody._output, undefined, Params>(
  { body: UpdatePayslipBody },
  async ({ params, body, userId }) => updatePayslip(db, { payslipId: params.payslipId, actorUserId: userId, body }),
);
