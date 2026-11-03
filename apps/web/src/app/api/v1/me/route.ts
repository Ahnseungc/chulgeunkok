import { UpdateMeBody } from '@/features/auth/schema';
import { getMe, updateMyName } from '@/features/auth/server/me-service';
import { db } from '@/server/db';
import { defineRoute } from '@/server/http/define-route';

/** GET /api/v1/me — docs/specs/auth/README.md §8 */
export const GET = defineRoute({}, async ({ userId }) => getMe(db, userId));

/** PATCH /api/v1/me — docs/specs/auth/README.md §8 */
export const PATCH = defineRoute({ body: UpdateMeBody }, async ({ body, userId }) =>
  updateMyName(db, { userId, name: body.name }),
);
