import { getDashboard } from '@/features/dashboard/server/dashboard-service';
import { db } from '@/server/db';
import { defineRoute } from '@/server/http/define-route';

/** GET /api/v1/stores/:storeId/dashboard — docs/specs/dashboard/README.md §5 */
export const GET = defineRoute<undefined, undefined, { storeId: string }>({}, async ({ params, userId }) =>
  getDashboard(db, { storeId: params.storeId, actorUserId: userId, now: new Date() }),
);
