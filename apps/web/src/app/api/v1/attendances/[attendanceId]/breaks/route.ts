import { AdminReplaceBreaksBody } from '@/features/attendance/schema';
import { replaceBreaksByAdmin } from '@/features/attendance/server/break-edit-service';
import { db } from '@/server/db';
import { defineRoute } from '@/server/http/define-route';

type Params = { attendanceId: string };

/** PUT /api/v1/attendances/:attendanceId/breaks — 관리자 휴게 고치기 (docs/specs/attendance/README.md §7.6) */
export const PUT = defineRoute<typeof AdminReplaceBreaksBody._output, undefined, Params>(
  { body: AdminReplaceBreaksBody },
  async ({ params, body, userId }) =>
    replaceBreaksByAdmin(db, { attendanceId: params.attendanceId, actorUserId: userId, body, now: new Date() }),
);
