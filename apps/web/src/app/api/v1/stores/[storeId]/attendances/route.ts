import { StoreAttendanceQuery } from '@/features/attendance/schema';
import { notImplemented } from '@/server/http/api-error';
import { defineRoute } from '@/server/http/define-route';

/** GET /api/v1/stores/:storeId/attendances — docs/specs/attendance/README.md §8 */
export const GET = defineRoute({ query: StoreAttendanceQuery }, async () => notImplemented());
