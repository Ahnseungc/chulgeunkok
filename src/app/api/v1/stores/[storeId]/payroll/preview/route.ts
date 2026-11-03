import { PayrollPreviewQuery } from '@/features/payroll/schema';
import { notImplemented } from '@/server/http/api-error';
import { defineRoute } from '@/server/http/define-route';

/** GET /api/v1/stores/:storeId/payroll/preview — docs/specs/payroll/README.md §4 */
export const GET = defineRoute({ query: PayrollPreviewQuery }, async () => notImplemented());
