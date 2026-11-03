import { getCurrentAttendance } from '@/features/attendance/server/punch-service';
import { db } from '@/server/db';
import { defineRoute } from '@/server/http/define-route';
import { StoreIdQuery } from '@/shared/schema/common';

/** GET /api/v1/attendance/current — docs/specs/attendance/README.md §3.5 */
export const GET = defineRoute({ query: StoreIdQuery }, async ({ query, userId }) => ({
  attendance: await getCurrentAttendance(db, { userId, storeId: query.storeId }),
}));
