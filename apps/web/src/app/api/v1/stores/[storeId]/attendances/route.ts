import { AdminCreateAttendanceBody, StoreAttendanceQuery } from '@/features/attendance/schema';
import { createAttendanceByAdmin, listStoreAttendances } from '@/features/attendance/server/attendance-admin-service';
import { db } from '@/server/db';
import { defineRoute } from '@/server/http/define-route';

type Params = { storeId: string };

/** GET /api/v1/stores/:storeId/attendances — docs/specs/attendance/README.md §8 */
export const GET = defineRoute<undefined, typeof StoreAttendanceQuery._output, Params>(
  { query: StoreAttendanceQuery },
  async ({ params, query, userId }) =>
    listStoreAttendances(db, { storeId: params.storeId, actorUserId: userId, ...query, now: new Date() }),
);

/** POST /api/v1/stores/:storeId/attendances — 관리자 근태 추가 (docs/specs/attendance/README.md §7.5) */
export const POST = defineRoute<typeof AdminCreateAttendanceBody._output, undefined, Params>(
  { body: AdminCreateAttendanceBody },
  async ({ params, body, userId }) =>
    createAttendanceByAdmin(db, { storeId: params.storeId, actorUserId: userId, body, now: new Date() }),
);
