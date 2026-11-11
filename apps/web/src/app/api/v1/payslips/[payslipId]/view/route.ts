import { markPayslipViewed } from '@/features/payslip/server/payslip-query-service';
import { db } from '@/server/db';
import { defineRoute } from '@/server/http/define-route';

/** POST /api/v1/payslips/:payslipId/view — 본인 첫 열람 기록, INACTIVE 포함 (docs/specs/payslip/README.md §5.3·§7) */
export const POST = defineRoute<undefined, undefined, { payslipId: string }>({}, async ({ params, userId }) => {
  await markPayslipViewed(db, { payslipId: params.payslipId, userId, now: new Date() });
  return { ok: true };
});
