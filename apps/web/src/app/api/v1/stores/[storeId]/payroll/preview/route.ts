import { PayrollPreviewQuery } from '@/features/payroll/schema';
import { getPayrollPreview } from '@/features/payroll/server/payroll-service';
import { db } from '@/server/db';
import { defineRoute } from '@/server/http/define-route';

/** GET /api/v1/stores/:storeId/payroll/preview — docs/specs/payroll/README.md §4 */
export const GET = defineRoute<undefined, typeof PayrollPreviewQuery._output, { storeId: string }>(
  { query: PayrollPreviewQuery },
  async ({ params, query, userId }) =>
    getPayrollPreview(db, { storeId: params.storeId, actorUserId: userId, periodStart: query.periodStart, now: new Date() }),
);
