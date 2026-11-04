import type { LaborReviewStatus, PrismaClient } from '@chulgeunkok/db';

import { requireMembership } from '@/server/auth/require-membership';
import { ApiError } from '@/server/http/api-error';

import type { LaborReviewDto } from '../model/labor-types';

import { toReviewDtos } from './labor-context';

/** 아직 처리하지 않은 안내 (대시보드·직원 상세 "검토 필요") */
export const OPEN_REVIEW_STATUSES = ['OPEN', 'NEEDS_INFORMATION'] as const satisfies readonly LaborReviewStatus[];

/** GET /stores/:storeId/labor-reviews — docs/specs/labor §8 */
export async function listStoreReviews(
  db: PrismaClient,
  input: { storeId: string; actorUserId: string; status?: LaborReviewStatus; memberId?: string; now: Date },
): Promise<LaborReviewDto[]> {
  await requireMembership({ storeId: input.storeId, userId: input.actorUserId, action: 'LABOR_REVIEW' }, db);
  const reviews = await db.laborReview.findMany({
    where: {
      membership: { storeId: input.storeId },
      ...(input.memberId ? { membershipId: input.memberId } : {}),
      // 기본은 처리할 일만. 대체·해소된 항목은 명시적으로 요청할 때만
      status: input.status ?? { in: [...OPEN_REVIEW_STATUSES] },
    },
    orderBy: { createdAt: 'desc' },
  });
  return toReviewDtos(db, { storeId: input.storeId, reviews, now: input.now });
}

/**
 * PATCH /labor-reviews/:id — "확인했어요" 또는 바텀시트 노출 기록 (docs/specs/labor §6.1)
 * ACKNOWLEDGED는 "안내를 봤다"는 뜻이지 지급 의무가 없다는 뜻이 아니다.
 */
export async function updateReview(
  db: PrismaClient,
  input: { reviewId: string; actorUserId: string; change: { status: 'ACKNOWLEDGED' } | { seen: true }; now: Date },
): Promise<LaborReviewDto> {
  const review = await db.laborReview.findUnique({
    where: { id: input.reviewId },
    include: { membership: true },
  });
  if (!review) throw new ApiError('NOT_FOUND');
  const storeId = review.membership.storeId;
  await requireMembership({ storeId, userId: input.actorUserId, action: 'LABOR_REVIEW' }, db);

  const isOpen = (OPEN_REVIEW_STATUSES as readonly string[]).includes(review.status);
  if ('status' in input.change && !isOpen) throw new ApiError('LABOR_REVIEW_STATUS_INVALID');
  const updated = await db.laborReview.update({
    where: { id: review.id },
    data:
      'status' in input.change
        ? { status: 'ACKNOWLEDGED', acknowledgedById: input.actorUserId, acknowledgedAt: input.now, seenAt: review.seenAt ?? input.now }
        : { seenAt: review.seenAt ?? input.now },
  });
  const [dto] = await toReviewDtos(db, { storeId, reviews: [updated], now: input.now });
  if (!dto) throw new ApiError('INTERNAL');
  return dto;
}
