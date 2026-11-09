'use client';

import { useOnRevive } from '@ahnseungchan/webviewkit';
import { ActionButton, Text } from '@seed-design/react';
import { useState } from 'react';

import { useApiResource } from '@/shared/lib/useApiResource';

import type { MemberSummaryDto } from '../model/member-types';

import InviteQrSheet from './InviteQrSheet';
import { ROLE_LABEL } from './member-labels';
import { AppBackLink, AppLink } from '@/shared/ui/AppLink';

interface MembersScreenProps {
  storeId: string;
}

type StatusFilter = 'ACTIVE' | 'INACTIVE';

/** `/owner/[storeId]/members` — docs/specs/staff §5.1 */
export default function MembersScreen({ storeId }: MembersScreenProps) {
  const [status, setStatus] = useState<StatusFilter>('ACTIVE');
  const [inviteOpen, setInviteOpen] = useState(false);
  const { data, errorMessage, reload } = useApiResource<{ members: MemberSummaryDto[] }>(
    `/api/v1/stores/${storeId}/members?status=${status}`,
  );
  // 스택에서 되살아나면 보관된 화면을 보여 준 채 최신 목록으로 다시 불러온다
  useOnRevive(() => void reload());

  return (
    <main className="screen">
      <AppBackLink href={`/owner/${storeId}`} className="back-link">
        ← 매장 홈
      </AppBackLink>
      <Text as="h1" textStyle="t8Bold">
        직원
      </Text>
      <div className="segmented" role="group" aria-label="직원 상태">
        {(['ACTIVE', 'INACTIVE'] as const).map((value) => (
          <ActionButton
            key={value}
            size="small"
            variant={status === value ? 'neutralSolid' : 'neutralWeak'}
            aria-pressed={status === value}
            onClick={() => setStatus(value)}
          >
            {value === 'ACTIVE' ? '재직' : '퇴사'}
          </ActionButton>
        ))}
      </div>
      {errorMessage ? (
        <Text as="p" textStyle="t5Regular" color="fg.critical" role="alert">
          {errorMessage}
        </Text>
      ) : null}
      {data && data.members.length === 0 ? (
        <Text as="p" textStyle="t5Regular" color="fg.neutralMuted">
          {status === 'ACTIVE' ? '아직 직원이 없어요. 직원 등록 QR을 띄워 보세요.' : '퇴사한 직원이 없어요.'}
        </Text>
      ) : null}
      <ul className="store-list">
        {data?.members.map((member) => (
          <li key={member.memberId}>
            <AppLink className="store-list__item" href={`/owner/${storeId}/members/${member.memberId}`}>
              <div className="member-row">
                <Text textStyle="t5Bold">{member.name}</Text>
                <Text textStyle="t4Regular" color="fg.neutralMuted">
                  {ROLE_LABEL[member.role]}
                </Text>
              </div>
              <MemberBadges member={member} />
            </AppLink>
          </li>
        ))}
      </ul>
      <div className="punch-bottom">
        <ActionButton variant="neutralSolid" size="large" flexGrow onClick={() => setInviteOpen(true)}>
          직원 등록
        </ActionButton>
      </div>
      <InviteQrSheet
        open={inviteOpen}
        onClose={() => {
          setInviteOpen(false);
          void reload();
        }}
        storeId={storeId}
        target={{ kind: 'JOIN' }}
      />
    </main>
  );
}

function MemberBadges({ member }: { member: MemberSummaryDto }) {
  const badges = [
    member.isWorking ? { label: '근무 중', tone: 'positive' } : null,
    member.status === 'ACTIVE' && member.role !== 'OWNER' && !member.hasTerms
      ? { label: '근로조건 필요', tone: 'critical' }
      : null,
    member.openReviewCount > 0 ? { label: `안내 ${member.openReviewCount}건`, tone: 'warning' } : null,
  ].filter((badge): badge is { label: string; tone: string } => badge !== null);
  if (badges.length === 0) return null;
  return (
    <div className="badges">
      {badges.map((badge) => (
        <span key={badge.label} className={`badge badge--${badge.tone}`}>
          {badge.label}
        </span>
      ))}
    </div>
  );
}
