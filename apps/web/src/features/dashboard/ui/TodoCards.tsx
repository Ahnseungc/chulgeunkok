import { Text } from '@seed-design/react';

import type { DashboardDto } from '../model/dashboard-types';
import { AppLink } from '@/shared/ui/AppLink';

interface TodoCardsProps {
  storeId: string;
  todo: DashboardDto['todo'];
}

/**
 * 처리할 일. 정산을 막는 순서대로, 0건은 숨긴다 (docs/specs/dashboard §4).
 */
export default function TodoCards({ storeId, todo }: TodoCardsProps) {
  const membersPath = `/owner/${storeId}/members` as const;
  const missingPath = `/owner/${storeId}/attendances?status=MISSING_CLOCK_OUT` as const;
  const correctionsPath = `/owner/${storeId}/corrections` as const;
  const cards = [
    { count: todo.termsMissing, title: '근로조건 필요', description: '근로조건이 없으면 출근할 수 없어요', href: membersPath },
    { count: todo.missingClockOut, title: '퇴근 누락', description: '퇴근 시각을 넣어 주세요', href: missingPath },
    { count: todo.pendingCorrections, title: '수정 요청', description: '직원이 기록 수정을 요청했어요', href: correctionsPath },
    { count: todo.laborReviews ?? 0, title: '확인할 안내', description: '최저임금·휴게·주휴 안내', href: membersPath },
    { count: todo.pendingInvitations, title: '대기 중 초대', description: '아직 수락하지 않은 등록 QR·링크', href: membersPath },
  ].filter((card) => card.count > 0);

  if (cards.length === 0) return null;
  return (
    <section className="dash-card" aria-labelledby="todo-heading">
      <Text as="h2" id="todo-heading" textStyle="t6Bold">
        처리할 일
      </Text>
      <ul className="dash-list">
        {cards.map((card) => {
          const content = (
            <>
              <Text textStyle="t5Bold">
                {card.title} {card.count}건
              </Text>
              <Text textStyle="t4Regular" color="fg.neutralMuted">
                {card.description}
              </Text>
            </>
          );
          return (
            <li key={card.title}>
              {card.href ? (
                <AppLink href={card.href} className="dash-list__row">
                  {content}
                </AppLink>
              ) : (
                <div className="dash-list__row">{content}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
