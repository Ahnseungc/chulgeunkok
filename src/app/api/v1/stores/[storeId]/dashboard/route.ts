import { notImplemented } from '@/server/http/api-error';
import { defineRoute } from '@/server/http/define-route';

/** GET /api/v1/stores/:storeId/dashboard — docs/specs/dashboard/README.md §5 */
export const GET = defineRoute({}, async () => notImplemented());
