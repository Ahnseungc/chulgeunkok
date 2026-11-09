'use client';

import { useOnRevive } from '@ahnseungchan/webviewkit';
import { ActionButton, Text } from '@seed-design/react';
import { useState } from 'react';

import type { MemberSummaryDto } from '@/features/staff/model/member-types';
import { formatClock, formatDuration, formatLocalDate } from '@/shared/lib/format-time';
import { useApiResource } from '@/shared/lib/useApiResource';
import { CardStaggerList } from '@/shared/motion/CardStaggerList';
import PeriodNav from '@/shared/ui/PeriodNav';

import type { AttendanceListDto, AttendanceRowDto } from '../model/attendance-admin-types';
import { AppBackLink, AppLink } from '@/shared/ui/AppLink';

const SECOND_MS = 1000;

interface AttendancesScreenProps {
  storeId: string;
  initialMemberId?: string;
  initialStatus?: string;
  initialPeriodStart?: string;
}

/** `/owner/[storeId]/attendances` — 정산 기간 단위 근태 목록 (docs/specs/attendance §8) */
export default function AttendancesScreen({ storeId, initialMemberId, initialStatus, initialPeriodStart }: AttendancesScreenProps) {
  const [periodStart, setPeriodStart] = useState(initialPeriodStart);
  const [memberId, setMemberId] = useState(initialMemberId ?? '');
  const [onlyMissing, setOnlyMissing] = useState(initialStatus === 'MISSING_CLOCK_OUT');
  const query = new URLSearchParams({
    ...(periodStart ? { periodStart } : {}),
    ...(memberId ? { memberId } : {}),
    ...(onlyMissing ? { status: 'MISSING_CLOCK_OUT' } : {}),
  });
  const list = useApiResource<AttendanceListDto>(`/api/v1/stores/${storeId}/attendances?${query}`);
  const members = useApiResource<{ members: MemberSummaryDto[] }>(`/api/v1/stores/${storeId}/members?status=ACTIVE`);
  // 스택에서 되살아나면 보관된 화면을 보여 준 채 최신 목록으로 다시 불러온다
  useOnRevive(() => {
    void list.reload();
    void members.reload();
  });

  return (
    <main className="screen">
      <AppBackLink href={`/owner/${storeId}`} className="back-link">
        ← 매장 홈
      </AppBackLink>
      <Text as="h1" textStyle="t8Bold">
        근태 기록
      </Text>
      {list.data ? <PeriodNav period={list.data.period} onChange={setPeriodStart} /> : null}
      <div className="filters">
        <select className="native-select" aria-label="직원" value={memberId} onChange={(event) => setMemberId(event.target.value)}>
          <option value="">전체 직원</option>
          {members.data?.members.map((member) => (
            <option key={member.memberId} value={member.memberId}>
              {member.name}
            </option>
          ))}
        </select>
        <ActionButton
          size="small"
          variant={onlyMissing ? 'neutralSolid' : 'neutralWeak'}
          aria-pressed={onlyMissing}
          onClick={() => setOnlyMissing(!onlyMissing)}
        >
          퇴근 누락만
        </ActionButton>
      </div>
      {list.errorMessage ? (
        <Text as="p" textStyle="t5Regular" color="fg.critical" role="alert">
          {list.errorMessage}
        </Text>
      ) : null}
      {list.data && list.data.rows.length === 0 ? (
        <Text as="p" textStyle="t5Regular" color="fg.neutralMuted">
          이 기간에는 기록이 없어요
        </Text>
      ) : null}
      <CardStaggerList
        className="store-list"
        items={list.data?.rows ?? []}
        getKey={(row) => row.id}
        renderItem={(row) => (
          <AppLink className="store-list__item" href={`/owner/${storeId}/attendances/${row.id}`}>
            <div className="member-row">
              <Text textStyle="t5Bold">{row.name}</Text>
              <Text textStyle="t4Regular" color="fg.neutralMuted">
                {formatLocalDate(row.localDate)}
              </Text>
            </div>
            <Text textStyle="t4Regular">{timeRange(row)}</Text>
            <AttendanceBadges row={row} />
          </AppLink>
        )}
      />
    </main>
  );
}

function timeRange(row: AttendanceRowDto): string {
  const start = formatClock(row.clockInAt);
  if (!row.clockOutAt) return `${start} ~`;
  const recognized = row.status === 'CLOSED' ? ` · 인정 ${formatDuration(row.recognizedSeconds * SECOND_MS)}` : '';
  return `${start} ~ ${formatClock(row.clockOutAt)}${recognized}`;
}

const STATUS_BADGE = {
  OPEN: { label: '근무 중', tone: 'positive' },
  MISSING_CLOCK_OUT: { label: '퇴근 누락', tone: 'critical' },
  VOID: { label: '무효', tone: 'neutral' },
  CLOSED: null,
} as const;

export function AttendanceBadges({ row }: { row: AttendanceRowDto }) {
  const badges = [
    STATUS_BADGE[row.status],
    row.outsideArea ? { label: '매장 밖', tone: 'warning' } : null,
    row.breakWaived ? { label: '휴게 못 함', tone: 'neutral' } : null,
    row.breakNotScheduled ? { label: '휴게 미설정', tone: 'neutral' } : null,
    row.revised ? { label: '수정됨', tone: 'neutral' } : null,
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
