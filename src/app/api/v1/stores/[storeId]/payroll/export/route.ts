import { PayrollExportQuery } from '@/features/payroll/schema';
import { notImplemented } from '@/server/http/api-error';
import { defineRoute } from '@/server/http/define-route';

/** GET /api/v1/stores/:storeId/payroll/export — docs/specs/payroll/README.md §5 */
export const GET = defineRoute({ query: PayrollExportQuery }, async () => notImplemented());
