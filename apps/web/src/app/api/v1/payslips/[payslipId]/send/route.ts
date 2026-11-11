import { sendPayslip } from '@/features/payslip/server/payslip-send-service';
import { db } from '@/server/db';
import { defineRoute } from '@/server/http/define-route';

/** POST /api/v1/payslips/:payslipId/send — 단건 보내기 (docs/specs/payslip/README.md §4.2·§6·§7) */
export const POST = defineRoute<undefined, undefined, { payslipId: string }>({}, async ({ params, userId }) =>
  sendPayslip(db, { payslipId: params.payslipId, actorUserId: userId, now: new Date() }),
);
