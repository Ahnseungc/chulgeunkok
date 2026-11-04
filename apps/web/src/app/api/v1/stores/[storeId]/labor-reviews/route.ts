import { LaborReviewListQuery } from '@/features/labor/schema';
import { listStoreReviews } from '@/features/labor/server/review-service';
import { db } from '@/server/db';
import { defineRoute } from '@/server/http/define-route';

/** GET /api/v1/stores/:storeId/labor-reviews — docs/specs/labor/README.md §8 */
export const GET = defineRoute<undefined, typeof LaborReviewListQuery._output, { storeId: string }>(
  { query: LaborReviewListQuery },
  async ({ params, query, userId }) => ({
    reviews: await listStoreReviews(db, {
      storeId: params.storeId,
      actorUserId: userId,
      status: query.status,
      now: new Date(),
    }),
  }),
);
