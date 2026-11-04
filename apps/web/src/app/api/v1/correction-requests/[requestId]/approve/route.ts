import { ApproveCorrectionBody } from '@/features/attendance/schema';
import { approveCorrectionRequest } from '@/features/attendance/server/correction-service';
import { db } from '@/server/db';
import { defineRoute } from '@/server/http/define-route';

/** POST /api/v1/correction-requests/:requestId/approve — docs/specs/attendance/README.md §7.3 */
export const POST = defineRoute<typeof ApproveCorrectionBody._output, undefined, { requestId: string }>(
  { body: ApproveCorrectionBody },
  async ({ params, body, userId }) =>
    approveCorrectionRequest(db, { requestId: params.requestId, actorUserId: userId, override: body, now: new Date() }),
);
