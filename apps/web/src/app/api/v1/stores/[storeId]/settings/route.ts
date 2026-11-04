import { getStoreSettings } from '@/features/store/server/store-settings-service';
import { db } from '@/server/db';
import { defineRoute } from '@/server/http/define-route';

/** GET /api/v1/stores/:storeId/settings — 사장님 매장 설정 (docs/specs/store/README.md §7) */
export const GET = defineRoute<undefined, undefined, { storeId: string }>({}, async ({ params, userId }) =>
  getStoreSettings(db, { storeId: params.storeId, actorUserId: userId, now: new Date() }),
);
