import { endBreak } from '@/features/attendance/server/break-service';
import { db } from '@/server/db';
import { defineRoute } from '@/server/http/define-route';
import { StoreIdQuery } from '@/shared/schema/common';

/** POST /api/v1/attendance/break/end — docs/specs/attendance/README.md §3.6 */
export const POST = defineRoute({ body: StoreIdQuery }, async ({ body, userId }) =>
  endBreak(db, { userId, storeId: body.storeId, now: new Date() }),
);
