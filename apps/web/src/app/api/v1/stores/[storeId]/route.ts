import { UpdateStoreBody } from '@/features/store/schema';
import { notImplemented } from '@/server/http/api-error';
import { defineRoute } from '@/server/http/define-route';

/** GET /api/v1/stores/:storeId — docs/specs/store/README.md §8 */
export const GET = defineRoute({}, async () => notImplemented());

/** PATCH /api/v1/stores/:storeId — docs/specs/store/README.md §4 */
export const PATCH = defineRoute({ body: UpdateStoreBody }, async () => notImplemented());
