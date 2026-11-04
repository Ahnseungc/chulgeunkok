import { CreateCorrectionBody } from '@/features/attendance/schema';
import { createCorrectionRequest } from '@/features/attendance/server/correction-service';
import { db } from '@/server/db';
import { defineRoute } from '@/server/http/define-route';

/** POST /api/v1/attendances/:attendanceId/correction-requests — 직원 본인 (docs/specs/attendance/README.md §7.1) */
export const POST = defineRoute<typeof CreateCorrectionBody._output, undefined, { attendanceId: string }>(
  { body: CreateCorrectionBody },
  async ({ params, body, userId }) =>
    createCorrectionRequest(db, { attendanceId: params.attendanceId, actorUserId: userId, body, now: new Date() }),
);
