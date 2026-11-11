import { PayslipListQuery } from '@/features/payslip/schema';
import { listStorePayslips } from '@/features/payslip/server/payslip-query-service';
import { db } from '@/server/db';
import { defineRoute } from '@/server/http/define-route';

/** GET /api/v1/stores/:storeId/payslips — 끝난 기간이면 동기화 후 목록 (docs/specs/payslip/README.md §4.3·§7) */
export const GET = defineRoute<undefined, typeof PayslipListQuery._output, { storeId: string }>(
  { query: PayslipListQuery },
  async ({ params, query, userId }) =>
    listStorePayslips(db, { storeId: params.storeId, actorUserId: userId, periodStart: query.periodStart, now: new Date() }),
);
