import { AdminUpdateAttendanceBody } from '@/features/attendance/schema';
import { getAttendanceDetail, updateAttendanceByAdmin } from '@/features/attendance/server/attendance-admin-service';
import { db } from '@/server/db';
import { defineRoute } from '@/server/http/define-route';

type Params = { attendanceId: string };

/** GET /api/v1/attendances/:attendanceId — docs/specs/attendance/README.md §9 */
export const GET = defineRoute<undefined, undefined, Params>({}, async ({ params, userId }) =>
  getAttendanceDetail(db, { attendanceId: params.attendanceId, actorUserId: userId, now: new Date() }),
);

/** PATCH /api/v1/attendances/:attendanceId — 관리자 직접 수정 (docs/specs/attendance/README.md §7.4) */
export const PATCH = defineRoute<typeof AdminUpdateAttendanceBody._output, undefined, Params>(
  { body: AdminUpdateAttendanceBody },
  async ({ params, body, userId }) =>
    updateAttendanceByAdmin(db, { attendanceId: params.attendanceId, actorUserId: userId, change: body, now: new Date() }),
);
