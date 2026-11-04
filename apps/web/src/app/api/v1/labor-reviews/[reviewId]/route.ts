import { UpdateLaborReviewBody } from '@/features/labor/schema';
import { updateReview } from '@/features/labor/server/review-service';
import { db } from '@/server/db';
import { defineRoute } from '@/server/http/define-route';

/** PATCH /api/v1/labor-reviews/:reviewId — docs/specs/labor/README.md §6.1 */
export const PATCH = defineRoute<typeof UpdateLaborReviewBody._output, undefined, { reviewId: string }>(
  { body: UpdateLaborReviewBody },
  async ({ params, body, userId }) =>
    updateReview(db, { reviewId: params.reviewId, actorUserId: userId, change: body, now: new Date() }),
);
