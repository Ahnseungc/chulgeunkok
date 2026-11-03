import { AdminUpdateAttendanceBody } from '@/features/attendance/schema';
import { notImplemented } from '@/server/http/api-error';
import { defineRoute } from '@/server/http/define-route';

/** GET /api/v1/attendances/:attendanceId — docs/specs/attendance/README.md §9 */
export const GET = defineRoute({}, async () => notImplemented());

/** PATCH /api/v1/attendances/:attendanceId — docs/specs/attendance/README.md §7.4 */
export const PATCH = defineRoute({ body: AdminUpdateAttendanceBody }, async () => notImplemented());
