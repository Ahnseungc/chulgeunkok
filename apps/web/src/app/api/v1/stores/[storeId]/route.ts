import { UpdateStoreBody } from '@/features/store/schema';
import { getStoreSummary } from '@/features/store/server/store-service';
import { db } from '@/server/db';
import { notImplemented } from '@/server/http/api-error';
import { defineRoute } from '@/server/http/define-route';

type Params = { storeId: string };

/** GET /api/v1/stores/:storeId — docs/specs/store/README.md §8 */
export const GET = defineRoute<undefined, undefined, Params>({}, async ({ params, userId }) =>
  getStoreSummary(db, { storeId: params.storeId, actorUserId: userId }),
);

/** PATCH /api/v1/stores/:storeId — docs/specs/store/README.md §4 */
export const PATCH = defineRoute({ body: UpdateStoreBody }, async () => notImplemented());
