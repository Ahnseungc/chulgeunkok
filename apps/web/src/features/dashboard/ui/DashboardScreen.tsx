'use client';

import { ActionButton, Text } from '@seed-design/react';

import { formatClock, formatDuration, formatPeriodRange } from '@/shared/lib/format-time';
import { usePolling, useApiResource } from '@/shared/lib/useApiResource';
import { useServerNow } from '@/shared/lib/useServerNow';
import { PageStaggerEntrance, PageStaggerEntranceItem } from '@/shared/motion/PageStaggerEntrance';
import { SmoothCountUpNumber } from '@/shared/motion/SmoothCountUpNumber';
import { useIntroCountUp } from '@/shared/motion/useIntroCountUp';

import type { DashboardDto } from '../model/dashboard-types';

import TodoCards from './TodoCards';
import { AppLink } from '@/shared/ui/AppLink';
import InlineAlert from '@/shared/ui/InlineAlert';
import ScreenHeader from '@/shared/ui/ScreenHeader';
import { TEXT_PLACEHOLDER } from '@/shared/ui/text-placeholder';

/** docs/specs/dashboard §5 */
const POLL_INTERVAL_MS = 30_000;
const SECOND_MS = 1000;

interface DashboardScreenProps {
  storeId: string;
}

const MENU = [
  { path: 'members', title: '직원', ready: true },
  { path: 'attendances', title: '근태 기록', ready: true },
  { path: 'payroll', title: '정산', ready: true },
  { path: 'settings', title: '매장 설정', ready: true },
] as const;

/** `/owner/[storeId]` 매장 홈 대시보드 — docs/specs/dashboard §3 */
export default function DashboardScreen({ storeId }: DashboardScreenProps) {
  const { data, errorMessage, reload } = useApiResource<DashboardDto>(`/api/v1/stores/${storeId}/dashboard`);
  usePolling(reload, POLL_INTERVAL_MS);
  const now = useServerNow(data?.serverNow ?? null);
  // 처음 받은 숫자만 카운트업. 30초 폴링·되살아남 재조회로 바뀐 값은 바로 바꾼다
  const workingIntro = useIntroCountUp(data?.working.length);
  const clockedInIntro = useIntroCountUp(data?.today.clockedInCount);
  const { basePayEstimate, allowanceEstimate } = data?.currentPeriod ?? {};
  const laborCost = basePayEstimate == null ? basePayEstimate : basePayEstimate + (allowanceEstimate ?? 0);
  const laborCostIntro = useIntroCountUp(laborCost);

  return (
    <main className="screen">
      {/* 매장 홈은 스택 루트라 스택 밖(/owner)으로 나간다 */}
      <ScreenHeader backHref="/owner" backLabel="내 매장" title={data?.store.name} leaveStack />
      <Text as="h1" textStyle="t8Bold">
        {data?.store.name ?? TEXT_PLACEHOLDER}
      </Text>
      {/* 30초 폴링이 실패해도 카드를 툭 밀지 않고 펼친다 */}
      <InlineAlert message={errorMessage} />

      {/* 첫 조회 때만 카드가 이어서 내려온다. 폴링은 data 만 바뀌고 다시 마운트되지 않아 재생하지 않는다 */}
      {data ? (
        <PageStaggerEntrance className="motion-contents">
          <PageStaggerEntranceItem>
            <section className="dash-card" aria-labelledby="working-heading">
              <Text as="h2" id="working-heading" textStyle="t6Bold">
                지금 근무 중 <SmoothCountUpNumber value={data.working.length} {...workingIntro} />명
              </Text>
              {data.working.length === 0 ? (
                <Text textStyle="t4Regular" color="fg.neutralMuted">
                  지금은 근무 중인 사람이 없어요
                </Text>
              ) : (
                <ul className="dash-list">
                  {data.working.map((row) => (
                    <li key={row.attendanceId}>
                      <AppLink href={`/owner/${storeId}/members/${row.memberId}`} className="dash-list__row">
                        <Text textStyle="t5Bold">{row.name}</Text>
                        <Text textStyle="t4Regular" color="fg.neutralMuted">
                          {formatClock(row.clockInAt)} 출근 · {formatDuration(now.getTime() - new Date(row.clockInAt).getTime())}
                        </Text>
                        {row.outsideArea ? <span className="badge badge--warning">매장 밖</span> : null}
                      </AppLink>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </PageStaggerEntranceItem>

          <PageStaggerEntranceItem>
            <section className="dash-card" aria-labelledby="today-heading">
              <Text as="h2" id="today-heading" textStyle="t6Bold">
                오늘 출근 <SmoothCountUpNumber value={data.today.clockedInCount} {...clockedInIntro} />명
                {data.today.scheduledCount > 0 ? ` / 근무 예정 ${data.today.scheduledCount}명` : ''}
              </Text>
              {data.today.notYetClockedIn.length > 0 ? (
                <ul className="dash-list">
                  {data.today.notYetClockedIn.map((row) => (
                    <li key={row.memberId}>
                      <AppLink href={`/owner/${storeId}/members/${row.memberId}`} className="dash-list__row">
                        <Text textStyle="t5Bold">{row.name}</Text>
                        <Text textStyle="t4Regular" color="fg.critical">
                          {formatClock(row.scheduledStartAt)} 출근 예정 · 아직 출근 전
                        </Text>
                      </AppLink>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          </PageStaggerEntranceItem>

          {/* 처리할 일이 0건이면 빈 칸이 되고 .motion-contents > :empty 로 gap 도 남기지 않는다 */}
          <PageStaggerEntranceItem>
            <TodoCards storeId={storeId} todo={data.todo} />
          </PageStaggerEntranceItem>

          <PageStaggerEntranceItem>
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
                  {laborCost != null ? (
                    <>
                      {' · 예상 인건비 '}
                      <SmoothCountUpNumber value={laborCost} {...laborCostIntro} />원
                    </>
                  ) : null}
                </Text>
              )}
            </section>
          </PageStaggerEntranceItem>
        </PageStaggerEntrance>
      ) : null}

      <nav className="dash-menu" aria-label="매장 메뉴">
        {MENU.map((item) =>
          item.ready ? (
            <ActionButton key={item.path} asChild variant="neutralWeak" size="medium">
              <AppLink href={`/owner/${storeId}/${item.path}`}>{item.title}</AppLink>
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
