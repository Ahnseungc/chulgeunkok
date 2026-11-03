import { DeclareHeadcountBody } from '@/features/store/schema';
import { notImplemented } from '@/server/http/api-error';
import { defineRoute } from '@/server/http/define-route';

/** POST /api/v1/stores/:storeId/headcount-declarations — docs/specs/store/README.md §6 */
export const POST = defineRoute({ body: DeclareHeadcountBody }, async () => notImplemented());

/** GET /api/v1/stores/:storeId/headcount-declarations — docs/specs/store/README.md §6 */
export const GET = defineRoute({}, async () => notImplemented());
