import { UpdateLaborReviewBody } from '@/features/labor/schema';
import { notImplemented } from '@/server/http/api-error';
import { defineRoute } from '@/server/http/define-route';

/** PATCH /api/v1/labor-reviews/:reviewId — docs/specs/labor/README.md §6 */
export const PATCH = defineRoute({ body: UpdateLaborReviewBody }, async () => notImplemented());
