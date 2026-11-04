'use client';

import { ActionButton, Text } from '@seed-design/react';
import { useState } from 'react';

import { apiFetch } from '@/shared/lib/api-client';
import { errorMessageOf } from '@/shared/lib/useApiResource';
import Sheet from '@/shared/ui/Sheet';

import { REVIEW_DISCLAIMER, type LaborReviewDto } from '../model/labor-types';

/** 한 시트에 보여 주는 안내 수. 나머지는 "외 n건" (docs/specs/labor §6.2) */
const MAX_VISIBLE_REVIEWS = 3;

interface ReviewSheetProps {
  reviews: LaborReviewDto[];
  open: boolean;
  onClose: () => void;
  /** "근로조건 수정"을 누르면 시트를 닫고 폼으로 */
  onEditTerms?: () => void;
}

/**
 * 근로조건 검토 안내. docs/specs/labor §6
 * - 확인했어요 → ACKNOWLEDGED (안내를 봤다는 뜻. 지급 의무가 없다는 뜻이 아니다)
 * - 나중에 → 본 것만 기록하고 목록에 남긴다
 */
export default function ReviewSheet({ reviews, open, onClose, onEditTerms }: ReviewSheetProps) {
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const visible = reviews.slice(0, MAX_VISIBLE_REVIEWS);
  const hiddenCount = reviews.length - visible.length;

  const updateAll = async (change: { status: 'ACKNOWLEDGED' } | { seen: true }) => {
    setPending(true);
    setErrorMessage(null);
    try {
      await Promise.all(
        reviews.map((review) =>
          apiFetch(`/api/v1/labor-reviews/${review.id}`, { method: 'PATCH', body: JSON.stringify(change) }),
        ),
      );
      onClose();
    } catch (error) {
      setErrorMessage(errorMessageOf(error));
    } finally {
      setPending(false);
    }
  };

  return (
    <Sheet open={open} onClose={() => void updateAll({ seen: true })} title="확인해 주세요">
      <ul className="review-list">
        {visible.map((review) => (
          <li key={review.id} className="review-list__item">
            <Text as="h3" textStyle="t5Bold">
              {review.title}
            </Text>
            <Text as="p" textStyle="t4Regular" color="fg.neutralMuted">
              {review.body}
            </Text>
          </li>
        ))}
      </ul>
      {hiddenCount > 0 ? (
        <Text as="p" textStyle="t4Regular" color="fg.neutralMuted">
          외 {hiddenCount}건은 직원 상세에서 볼 수 있어요
        </Text>
      ) : null}
      <Text as="p" textStyle="t3Regular" color="fg.neutralSubtle">
        {REVIEW_DISCLAIMER}
      </Text>
      {errorMessage ? (
        <Text as="p" textStyle="t4Regular" color="fg.critical" role="alert">
          {errorMessage}
        </Text>
      ) : null}
      <div className="sheet__actions">
        {onEditTerms ? (
          <ActionButton variant="neutralWeak" size="large" flexGrow disabled={pending} onClick={onEditTerms}>
            근로조건 수정
          </ActionButton>
        ) : null}
        <ActionButton
          variant="neutralSolid"
          size="large"
          flexGrow
          loading={pending}
          onClick={() => void updateAll({ status: 'ACKNOWLEDGED' })}
        >
          확인했어요
        </ActionButton>
      </div>
      <ActionButton variant="ghost" size="small" disabled={pending} onClick={() => void updateAll({ seen: true })}>
        나중에
      </ActionButton>
    </Sheet>
  );
}
