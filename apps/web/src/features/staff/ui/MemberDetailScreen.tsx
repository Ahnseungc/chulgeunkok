'use client';

import { ActionButton, Text } from '@seed-design/react';
import { AnimatePresence } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';

import type { LaborReviewDto } from '@/features/labor/model/labor-types';
import { UNDER_FIVE_BADGE_TEXT } from '@/features/labor/model/review-copy';
import ReviewSheet from '@/features/labor/ui/ReviewSheet';
import TermsSummary from '@/features/labor/ui/TermsSummary';
import { apiFetch } from '@/shared/lib/api-client';
import { errorMessageOf, useApiResource } from '@/shared/lib/useApiResource';
import { ExpandFadeReveal } from '@/shared/motion/ExpandFadeReveal';
import Sheet from '@/shared/ui/Sheet';

import type { MemberDetailDto } from '../model/member-types';

import InviteQrSheet from './InviteQrSheet';
import { ROLE_LABEL } from './member-labels';
import { AppLink } from '@/shared/ui/AppLink';
import ScreenHeader from '@/shared/ui/ScreenHeader';

interface MemberDetailScreenProps {
  storeId: string;
  memberId: string;
}

/** `/owner/[storeId]/members/[memberId]` — docs/specs/staff §5.2 */
export default function MemberDetailScreen({ storeId, memberId }: MemberDetailScreenProps) {
  const memberPath = `/api/v1/stores/${storeId}/members/${memberId}`;
  const member = useApiResource<MemberDetailDto>(memberPath);
  const reviews = useApiResource<{ reviews: LaborReviewDto[] }>(
    member.data?.canReadTerms ? `${memberPath}/labor-reviews` : null,
  );
  const [reregisterOpen, setReregisterOpen] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const unseenSheetReviews = useMemo(
    () => reviews.data?.reviews.filter((review) => review.presentation === 'SHEET' && !review.seen) ?? [],
    [reviews.data],
  );
  const [reviewSheetOpen, setReviewSheetOpen] = useState(false);

  // 아직 안 본 안내가 있으면 들어올 때 한 번 띄운다 (docs/specs/labor §6.2)
  useEffect(() => {
    if (unseenSheetReviews.length > 0) setReviewSheetOpen(true);
  }, [unseenSheetReviews.length]);

  const detail = member.data;
  const termsPath = `/owner/${storeId}/members/${memberId}/terms` as const;

  return (
    <main className="screen">
      <ScreenHeader backHref={`/owner/${storeId}/members`} backLabel="직원" title={detail?.name} />
      {member.errorMessage ? <ErrorText message={member.errorMessage} /> : null}
      {detail ? (
        <>
          <header className="member-header">
            <Text as="h1" textStyle="t8Bold">
              {detail.name}
            </Text>
            <Text textStyle="t4Regular" color="fg.neutralMuted">
              {ROLE_LABEL[detail.role]}
              {detail.status === 'INACTIVE' ? ' · 퇴사' : ''}
              {detail.isWorking ? ' · 근무 중' : ''}
            </Text>
          </header>

          {detail.role !== 'OWNER' ? (
            <section className="detail-section" aria-labelledby="terms-heading">
              <Text as="h2" id="terms-heading" textStyle="t6Bold">
                근로조건
              </Text>
              {!detail.canReadTerms ? (
                <Text textStyle="t4Regular" color="fg.neutralMuted">
                  근로조건은 사장님이나 권한 있는 매니저만 볼 수 있어요.
                </Text>
              ) : detail.currentTerms ? (
                <TermsSummary terms={detail.currentTerms} />
              ) : (
                <Text textStyle="t4Regular" color="fg.critical">
                  근로조건이 없어서 아직 출근할 수 없어요.
                </Text>
              )}
              {detail.canEditTerms ? (
                <ActionButton asChild variant="neutralWeak" size="medium">
                  <AppLink href={termsPath}>{detail.currentTerms ? '근로조건 수정' : '근로조건 등록'}</AppLink>
                </ActionButton>
              ) : null}
            </section>
          ) : null}

          {/* 안내는 직원 정보보다 늦게 와서, 툭 밀지 않고 펼치며 나타난다. 다 확인하면 접혀 사라진다 */}
          <AnimatePresence>
            {reviews.data && reviews.data.reviews.length > 0 ? (
              <ExpandFadeReveal key="reviews">
                <section className="detail-section" aria-labelledby="reviews-heading">
                  <Text as="h2" id="reviews-heading" textStyle="t6Bold">
                    확인할 안내 {reviews.data.reviews.length}건
                  </Text>
                  <ul className="review-list">
                    {reviews.data.reviews.map((review) => (
                      <li key={review.id} className={`review-list__item review-list__item--${review.presentation.toLowerCase()}`}>
                        <Text as="h3" textStyle="t5Bold">
                          {review.title}
                        </Text>
                        <Text as="p" textStyle="t4Regular" color="fg.neutralMuted">
                          {review.presentation === 'BADGE' ? UNDER_FIVE_BADGE_TEXT : review.body}
                        </Text>
                      </li>
                    ))}
                  </ul>
                  <ActionButton variant="neutralWeak" size="medium" onClick={() => setReviewSheetOpen(true)}>
                    확인하기
                  </ActionButton>
                </section>
              </ExpandFadeReveal>
            ) : null}
          </AnimatePresence>

          {detail.role !== 'OWNER' ? (
            <section className="detail-section" aria-labelledby="device-heading">
              <Text as="h2" id="device-heading" textStyle="t6Bold">
                휴대폰
              </Text>
              <Text textStyle="t4Regular" color="fg.neutralMuted">
                {detail.status === 'INACTIVE'
                  ? '다시 일하게 되면 기기 재등록 QR을 찍게 해 주세요. 이전 기록이 이어져요.'
                  : '휴대폰을 바꿨다면 새 휴대폰으로 기기 재등록 QR을 찍게 해 주세요.'}
              </Text>
              <ActionButton variant="neutralWeak" size="medium" onClick={() => setReregisterOpen(true)}>
                기기 재등록 QR
              </ActionButton>
              {detail.status === 'ACTIVE' ? (
                <ActionButton variant="ghost" size="medium" onClick={() => setDeactivateOpen(true)}>
                  퇴사 처리
                </ActionButton>
              ) : null}
            </section>
          ) : null}

          <InviteQrSheet
            open={reregisterOpen}
            onClose={() => {
              setReregisterOpen(false);
              void member.reload();
            }}
            storeId={storeId}
            target={{ kind: 'REREGISTER', memberId }}
            memberName={detail.name}
          />
          <DeactivateSheet
            open={deactivateOpen}
            onClose={() => setDeactivateOpen(false)}
            memberPath={memberPath}
            memberName={detail.name}
            onDone={() => void member.reload()}
          />
          <ReviewSheet
            reviews={reviews.data?.reviews.filter((review) => review.presentation !== 'LIST') ?? []}
            open={reviewSheetOpen}
            onClose={() => {
              setReviewSheetOpen(false);
              void reviews.reload();
              void member.reload();
            }}
          />
        </>
      ) : null}
    </main>
  );
}

interface DeactivateSheetProps {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  memberPath: string;
  memberName: string;
}

/** 퇴사 처리 확인. 근무 중이면 서버가 막는다 (docs/specs/staff §4.1) */
function DeactivateSheet({ open, onClose, onDone, memberPath, memberName }: DeactivateSheetProps) {
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const deactivate = async () => {
    setPending(true);
    setErrorMessage(null);
    try {
      await apiFetch(memberPath, { method: 'PATCH', body: JSON.stringify({ status: 'INACTIVE' }) });
      onClose();
      onDone();
    } catch (error) {
      setErrorMessage(errorMessageOf(error));
    } finally {
      setPending(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={`${memberName}님을 퇴사 처리할까요?`}>
      <Text as="p" textStyle="t5Regular" color="fg.neutralMuted">
        더 이상 출근할 수 없고, 지금까지의 근무 기록은 3년 동안 보관돼요.
      </Text>
      {errorMessage ? <ErrorText message={errorMessage} /> : null}
      <div className="sheet__actions">
        <ActionButton variant="neutralWeak" size="large" flexGrow onClick={onClose}>
          취소
        </ActionButton>
        <ActionButton variant="criticalSolid" size="large" flexGrow loading={pending} onClick={deactivate}>
          퇴사 처리
        </ActionButton>
      </div>
    </Sheet>
  );
}

function ErrorText({ message }: { message: string }) {
  return (
    <Text as="p" textStyle="t4Regular" color="fg.critical" role="alert">
      {message}
    </Text>
  );
}
