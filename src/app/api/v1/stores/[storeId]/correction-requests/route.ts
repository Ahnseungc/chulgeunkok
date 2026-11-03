import { CorrectionListQuery } from '@/features/attendance/schema';
import { notImplemented } from '@/server/http/api-error';
import { defineRoute } from '@/server/http/define-route';

/** GET /api/v1/stores/:storeId/correction-requests — docs/specs/attendance/README.md §9 */
export const GET = defineRoute({ query: CorrectionListQuery }, async () => notImplemented());
