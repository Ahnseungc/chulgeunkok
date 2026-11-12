'use client';

import { Text } from '@seed-design/react';

import { formatClock, formatLocalDate, toStoreLocalDate } from '@/shared/lib/format-time';
import { useApiResource } from '@/shared/lib/useApiResource';
import InlineAlert from '@/shared/ui/InlineAlert';

import type { MembershipEventDto } from '../model/member-types';

import { describeMembershipEvent } from './membership-event-copy';

interface MemberHistorySectionProps {
  memberPath: string;
}

const formatAt = (iso: string) => `${formatLocalDate(toStoreLocalDate(new Date(iso)))} ${formatClock(iso)}`;

/** 직원 상세 "변경 이력" — 사장님만 (docs/specs/staff §4.3). 최근 것 먼저 */
export default function MemberHistorySection({ memberPath }: MemberHistorySectionProps) {
  const { data, errorMessage } = useApiResource<{ events: MembershipEventDto[] }>(`${memberPath}/events`);

  return (
    <section className="detail-section" aria-labelledby="history-heading">
      <Text as="h2" id="history-heading" textStyle="t6Bold">
        변경 이력
      </Text>
      <InlineAlert message={errorMessage} textStyle="t4Regular" />
      {data && data.events.length === 0 ? (
        <Text textStyle="t4Regular" color="fg.neutralMuted">
          아직 바꾼 내용이 없어요.
        </Text>
      ) : null}
      {data && data.events.length > 0 ? (
        <ul className="review-list">
          {data.events.map((event) => (
            <li key={event.id} className="review-list__item">
              <Text textStyle="t5Regular">{describeMembershipEvent(event)}</Text>
              <Text textStyle="t3Regular" color="fg.neutralMuted">
                {formatAt(event.createdAt)} · {event.actorName}
              </Text>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
