import { UpdateStoreBody } from '@/features/store/schema';
import { getStoreSummary } from '@/features/store/server/store-service';
import { updateStore } from '@/features/store/server/store-settings-service';
import { db } from '@/server/db';
import { defineRoute } from '@/server/http/define-route';

type Params = { storeId: string };

/** GET /api/v1/stores/:storeId — docs/specs/store/README.md §8 */
export const GET = defineRoute<undefined, undefined, Params>({}, async ({ params, userId }) =>
  getStoreSummary(db, { storeId: params.storeId, actorUserId: userId }),
);

/** PATCH /api/v1/stores/:storeId — 이름·주소·정산 시작일 (docs/specs/store/README.md §4) */
export const PATCH = defineRoute<typeof UpdateStoreBody._output, undefined, Params>(
  { body: UpdateStoreBody },
  async ({ params, body, userId }) => updateStore(db, { storeId: params.storeId, actorUserId: userId, body, now: new Date() }),
);
