import { CreateTermsBody } from '@/features/labor/schema';
import { notImplemented } from '@/server/http/api-error';
import { defineRoute } from '@/server/http/define-route';

/** POST /api/v1/stores/:storeId/members/:memberId/employment-terms — docs/specs/labor/README.md §3.2 */
export const POST = defineRoute({ body: CreateTermsBody }, async () => notImplemented());

/** GET /api/v1/stores/:storeId/members/:memberId/employment-terms — docs/specs/labor/README.md §8 */
export const GET = defineRoute({}, async () => notImplemented());
