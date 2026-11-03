import { UpdateMeBody } from '@/features/auth/schema';
import { notImplemented } from '@/server/http/api-error';
import { defineRoute } from '@/server/http/define-route';

/** GET /api/v1/me — docs/specs/auth/README.md §8 */
export const GET = defineRoute({}, async () => notImplemented());

/** PATCH /api/v1/me — docs/specs/auth/README.md §8 */
export const PATCH = defineRoute({ body: UpdateMeBody }, async () => notImplemented());
