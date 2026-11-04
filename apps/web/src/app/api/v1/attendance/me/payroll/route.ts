import { getMyAttendances } from '@/features/attendance/server/my-attendance-service';
import { MyPayrollQuery } from '@/features/payroll/schema';
import { db } from '@/server/db';
import { defineRoute } from '@/server/http/define-route';

/** GET /api/v1/attendance/me/payroll — 본인 이번 기간 예상 기본급만 (docs/specs/payroll/README.md §4) */
export const GET = defineRoute({ query: MyPayrollQuery }, async ({ query, userId }) => {
  const { period, summary } = await getMyAttendances(db, {
    userId,
    storeId: query.storeId,
    periodStart: query.periodStart,
    now: new Date(),
  });
  return { period, ...summary };
});
