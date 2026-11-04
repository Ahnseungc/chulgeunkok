import { cancelCorrectionRequest } from '@/features/attendance/server/correction-service';
import { db } from '@/server/db';
import { defineRoute } from '@/server/http/define-route';

/** POST /api/v1/correction-requests/:requestId/cancel — 요청한 직원 본인 (docs/specs/attendance/README.md §7.1) */
export const POST = defineRoute<undefined, undefined, { requestId: string }>({}, async ({ params, userId }) =>
  cancelCorrectionRequest(db, { requestId: params.requestId, actorUserId: userId, now: new Date() }),
);
