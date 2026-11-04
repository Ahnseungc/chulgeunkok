import { listStoreReviews } from '@/features/labor/server/review-service';
import { db } from '@/server/db';
import { defineRoute } from '@/server/http/define-route';

/** GET /api/v1/stores/:storeId/members/:memberId/labor-reviews — 처리할 안내만 (docs/specs/labor/README.md §8) */
export const GET = defineRoute<undefined, undefined, { storeId: string; memberId: string }>(
  {},
  async ({ params, userId }) => ({
    reviews: await listStoreReviews(db, {
      storeId: params.storeId,
      memberId: params.memberId,
      actorUserId: userId,
      now: new Date(),
    }),
  }),
);
