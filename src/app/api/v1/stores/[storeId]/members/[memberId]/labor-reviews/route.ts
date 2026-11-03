import { notImplemented } from '@/server/http/api-error';
import { defineRoute } from '@/server/http/define-route';

/** GET /api/v1/stores/:storeId/members/:memberId/labor-reviews — docs/specs/labor/README.md §8 */
export const GET = defineRoute({}, async () => notImplemented());
