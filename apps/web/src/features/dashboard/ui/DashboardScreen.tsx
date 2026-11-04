'use client';

import { ActionButton, Text } from '@seed-design/react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { formatClock, formatDuration, formatPeriodRange } from '@/shared/lib/format-time';
import { usePolling, useApiResource } from '@/shared/lib/useApiResource';

import type { DashboardDto } from '../model/dashboard-types';

import TodoCards from './TodoCards';

/** docs/specs/dashboard §5 */
const POLL_INTERVAL_MS = 30_000;
const CLOCK_TICK_MS = 60_000;
const SECOND_MS = 1000;

interface DashboardScreenProps {
  storeId: string;
}

const MENU = [
  { path: 'members', title: '직원', ready: true },
  { path: 'attendances', title: '근태 기록', ready: true },
  { path: 'payroll', title: '정산', ready: true },
  { path: 'settings', title: '매장 설정', ready: false },
] as const;

/** `/owner/[storeId]` 매장 홈 대시보드 — docs/specs/dashboard §3 */
export default function DashboardScreen({ storeId }: DashboardScreenProps) {
  const { data, errorMessage, reload } = useApiResource<DashboardDto>(`/api/v1/stores/${storeId}/dashboard`);
  usePolling(reload, POLL_INTERVAL_MS);
  const now = useServerNow(data?.serverNow ?? null);

  return (
    <main className="screen">
      <Link href="/owner" className="back-link">
        ← 내 매장
      </Link>
      <Text as="h1" textStyle="t8Bold">
        {data?.store.name ?? ' '}
      </Text>
      {errorMessage ? (
        <Text as="p" textStyle="t5Regular" color="fg.critical" role="alert">
          {errorMessage}
        </Text>
      ) : null}

      {data ? (
        <>
          <section className="dash-card" aria-labelledby="working-heading">
            <Text as="h2" id="working-heading" textStyle="t6Bold">
              지금 근무 중 {data.working.length}명
            </Text>
            {data.working.length === 0 ? (
              <Text textStyle="t4Regular" color="fg.neutralMuted">
                지금은 근무 중인 사람이 없어요
              </Text>
            ) : (
              <ul className="dash-list">
                {data.working.map((row) => (
                  <li key={row.attendanceId}>
                    <Link href={`/owner/${storeId}/members/${row.memberId}`} className="dash-list__row">
                      <Text textStyle="t5Bold">{row.name}</Text>
                      <Text textStyle="t4Regular" color="fg.neutralMuted">
                        {formatClock(row.clockInAt)} 출근 · {formatDuration(now.getTime() - new Date(row.clockInAt).getTime())}
                      </Text>
                      {row.outsideArea ? <span className="badge badge--warning">매장 밖</span> : null}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="dash-card" aria-labelledby="today-heading">
            <Text as="h2" id="today-heading" textStyle="t6Bold">
              오늘 출근 {data.today.clockedInCount}명
              {data.today.scheduledCount > 0 ? ` / 근무 예정 ${data.today.scheduledCount}명` : ''}
            </Text>
            {data.today.notYetClockedIn.length > 0 ? (
              <ul className="dash-list">
                {data.today.notYetClockedIn.map((row) => (
                  <li key={row.memberId}>
                    <Link href={`/owner/${storeId}/members/${row.memberId}`} className="dash-list__row">
                      <Text textStyle="t5Bold">{row.name}</Text>
                      <Text textStyle="t4Regular" color="fg.critical">
                        {formatClock(row.scheduledStartAt)} 출근 예정 · 아직 출근 전
                      </Text>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          <TodoCards storeId={storeId} todo={data.todo} />

          <section className="dash-card" aria-labelledby="period-heading">
            <Text as="h2" id="period-heading" textStyle="t6Bold">
              이번 정산 기간
            </Text>
            <Text textStyle="t4Regular" color="fg.neutralMuted">
              {formatPeriodRange(data.currentPeriod.start, data.currentPeriod.end)}
            </Text>
            {data.currentPeriod.recognizedSeconds === 0 ? (
              <Text textStyle="t5Regular" color="fg.neutralMuted">
                아직 퇴근까지 끝난 근무가 없어요
              </Text>
            ) : (
              <Text textStyle="t5Bold">
                근무 {formatDuration(data.currentPeriod.recognizedSeconds * SECOND_MS)}
                {data.currentPeriod.basePayEstimate !== null
                  ? ` · 예상 기본급 ${data.currentPeriod.basePayEstimate.toLocaleString('ko-KR')}원`
                  : ''}
              </Text>
            )}
          </section>
        </>
      ) : null}

      <nav className="dash-menu" aria-label="매장 메뉴">
        {MENU.map((item) =>
          item.ready ? (
            <ActionButton key={item.path} asChild variant="neutralWeak" size="medium">
              <Link href={`/owner/${storeId}/${item.path}`}>{item.title}</Link>
            </ActionButton>
          ) : (
            <ActionButton key={item.path} variant="neutralWeak" size="medium" disabled>
              {item.title} (준비 중)
            </ActionButton>
          ),
        )}
      </nav>
    </main>
  );
}

/** 경과 시간은 서버 시각 기준으로 1분마다 갱신한다 (기기 시계가 틀려도 같다) */
function useServerNow(serverNow: string | null): Date {
  const [now, setNow] = useState(() => (serverNow ? new Date(serverNow) : new Date()));
  useEffect(() => {
    if (!serverNow) return;
    const offsetMs = new Date(serverNow).getTime() - Date.now();
    setNow(new Date(serverNow));
    const timer = setInterval(() => setNow(new Date(Date.now() + offsetMs)), CLOCK_TICK_MS);
    return () => clearInterval(timer);
  }, [serverNow]);
  return now;
}
