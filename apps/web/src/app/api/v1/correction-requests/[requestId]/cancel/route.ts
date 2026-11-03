import { notImplemented } from '@/server/http/api-error';
import { defineRoute } from '@/server/http/define-route';

/** POST /api/v1/correction-requests/:requestId/cancel — docs/specs/attendance/README.md §7.1 */
export const POST = defineRoute({}, async () => notImplemented());
