import { RejectCorrectionBody } from '@/features/attendance/schema';
import { rejectCorrectionRequest } from '@/features/attendance/server/correction-service';
import { db } from '@/server/db';
import { defineRoute } from '@/server/http/define-route';

/** POST /api/v1/correction-requests/:requestId/reject — 반려 사유 필수 (docs/specs/attendance/README.md §7.3) */
export const POST = defineRoute<typeof RejectCorrectionBody._output, undefined, { requestId: string }>(
  { body: RejectCorrectionBody },
  async ({ params, body, userId }) =>
    rejectCorrectionRequest(db, {
      requestId: params.requestId,
      actorUserId: userId,
      decisionNote: body.decisionNote,
      now: new Date(),
    }),
);
