import { SendPayslipsBody } from '@/features/payslip/schema';
import { sendPayslips } from '@/features/payslip/server/payslip-send-service';
import { db } from '@/server/db';
import { defineRoute } from '@/server/http/define-route';

/** POST /api/v1/stores/:storeId/payslips/send — 일괄 보내기 (docs/specs/payslip/README.md §4.2·§6·§7) */
export const POST = defineRoute<typeof SendPayslipsBody._output, undefined, { storeId: string }>(
  { body: SendPayslipsBody },
  async ({ params, body, userId }) =>
    sendPayslips(db, { storeId: params.storeId, payslipIds: body.payslipIds, actorUserId: userId, now: new Date() }),
);
