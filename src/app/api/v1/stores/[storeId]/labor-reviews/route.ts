import { LaborReviewListQuery } from '@/features/labor/schema';
import { notImplemented } from '@/server/http/api-error';
import { defineRoute } from '@/server/http/define-route';

/** GET /api/v1/stores/:storeId/labor-reviews — docs/specs/labor/README.md §8 */
export const GET = defineRoute({ query: LaborReviewListQuery }, async () => notImplemented());
