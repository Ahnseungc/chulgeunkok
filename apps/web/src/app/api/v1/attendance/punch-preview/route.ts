import { PunchPreviewQuery } from '@/features/attendance/schema';
import { getPunchPreview } from '@/features/attendance/server/punch-service';
import { db } from '@/server/db';
import { defineRoute } from '@/server/http/define-route';

/** GET /api/v1/attendance/punch-preview — docs/specs/attendance/README.md §3.2 */
export const GET = defineRoute({ query: PunchPreviewQuery }, async ({ query, userId }) =>
  getPunchPreview(db, { userId, qrToken: query.qrToken, now: new Date() }),
);
