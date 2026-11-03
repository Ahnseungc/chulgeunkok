import { RejectCorrectionBody } from '@/features/attendance/schema';
import { notImplemented } from '@/server/http/api-error';
import { defineRoute } from '@/server/http/define-route';

/** POST /api/v1/correction-requests/:requestId/reject — docs/specs/attendance/README.md §7.3 */
export const POST = defineRoute({ body: RejectCorrectionBody }, async () => notImplemented());
