import { DeclareHeadcountBody } from '@/features/store/schema';
import { declareHeadcount, getStoreSettings } from '@/features/store/server/store-settings-service';
import { db } from '@/server/db';
import { defineRoute } from '@/server/http/define-route';

type Params = { storeId: string };

/** POST /api/v1/stores/:storeId/headcount-declarations — docs/specs/store/README.md §6 */
export const POST = defineRoute<typeof DeclareHeadcountBody._output, undefined, Params>(
  { body: DeclareHeadcountBody },
  async ({ params, body, userId }) =>
    declareHeadcount(db, { storeId: params.storeId, actorUserId: userId, body, now: new Date() }),
);

/** GET /api/v1/stores/:storeId/headcount-declarations — 신고 이력 */
export const GET = defineRoute<undefined, undefined, Params>({}, async ({ params, userId }) => ({
  history: (await getStoreSettings(db, { storeId: params.storeId, actorUserId: userId, now: new Date() })).headcount.history,
}));
