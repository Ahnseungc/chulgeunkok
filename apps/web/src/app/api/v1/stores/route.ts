import { CreateStoreBody } from '@/features/store/schema';
import { notImplemented } from '@/server/http/api-error';
import { defineRoute } from '@/server/http/define-route';

/** POST /api/v1/stores — docs/specs/store/README.md §3 */
export const POST = defineRoute({ body: CreateStoreBody }, async () => notImplemented());

/** GET /api/v1/stores — docs/specs/store/README.md §8 */
export const GET = defineRoute({}, async () => notImplemented());
