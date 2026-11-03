import { notImplemented } from '@/server/http/api-error';
import { defineRoute } from '@/server/http/define-route';

/** GET /api/v1/attendances/:attendanceId/revisions — docs/specs/attendance/README.md §9 */
export const GET = defineRoute({}, async () => notImplemented());
