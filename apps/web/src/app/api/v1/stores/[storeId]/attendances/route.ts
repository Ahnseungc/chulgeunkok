import { StoreAttendanceQuery } from '@/features/attendance/schema';
import { listStoreAttendances } from '@/features/attendance/server/attendance-admin-service';
import { db } from '@/server/db';
import { defineRoute } from '@/server/http/define-route';

/** GET /api/v1/stores/:storeId/attendances — docs/specs/attendance/README.md §8 */
export const GET = defineRoute<undefined, typeof StoreAttendanceQuery._output, { storeId: string }>(
  { query: StoreAttendanceQuery },
  async ({ params, query, userId }) =>
    listStoreAttendances(db, { storeId: params.storeId, actorUserId: userId, ...query, now: new Date() }),
);
