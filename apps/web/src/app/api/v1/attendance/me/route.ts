import { MyAttendanceQuery } from '@/features/attendance/schema';
import { getMyAttendances } from '@/features/attendance/server/my-attendance-service';
import { db } from '@/server/db';
import { defineRoute } from '@/server/http/define-route';

/** GET /api/v1/attendance/me — 직원 본인 기록·예상 기본급 (docs/specs/attendance/README.md §8) */
export const GET = defineRoute({ query: MyAttendanceQuery }, async ({ query, userId }) =>
  getMyAttendances(db, { userId, storeId: query.storeId, periodStart: query.periodStart, now: new Date() }),
);
