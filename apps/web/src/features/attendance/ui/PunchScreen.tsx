'use client';

import { ActionButton, Text } from '@seed-design/react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { formatClock, formatDuration } from '@/shared/lib/format-time';
import { SuccessEntrance, SuccessEntranceItem, SuccessEntranceMark } from '@/shared/motion/SuccessEntrance';
import KokMark from '@/shared/ui/KokMark';
import { TEXT_PLACEHOLDER } from '@/shared/ui/text-placeholder';

import type { PunchAction, PunchPreviewDto } from '../model/punch-types';

import { usePunch, type PunchState } from './usePunch';

const CLOCK_TICK_MS = 15_000;
const noop = () => {};

const ACTION_LABEL = {
  CLOCK_IN: '출근',
  CLOCK_OUT: '퇴근',
} as const satisfies Record<PunchAction, string>;

interface PunchScreenProps {
  qrToken: string;
}

/** QR 랜딩 `/p/[qrToken]` — docs/specs/attendance §3.1·§3.4 */
export default function PunchScreen({ qrToken }: PunchScreenProps) {
  const { state, submit, reload } = usePunch(qrToken);

  return (
    <main className="screen punch-screen">
      <Image src="/brand/wordmark.png" alt="출근콕" width={104} height={40} priority />
      <PunchBody state={state} onSubmit={submit} onReload={reload} />
    </main>
  );
}

interface PunchBodyProps {
  state: PunchState;
  onSubmit: (preview: PunchPreviewDto) => void;
  onReload: () => void;
}

function PunchBody({ state, onSubmit, onReload }: PunchBodyProps) {
  if (state.phase === 'loading') {
    // 하단 버튼 자리를 먼저 잡아, 준비되면 같은 자리에서 버튼이 살아난다 (가운데 문구가 위로 밀리지 않게)
    return (
      <>
        <CenterMessage title="QR을 확인하고 있어요" />
        <BottomAction label="확인 중" loading disabled onClick={noop} />
      </>
    );
  }
  if (state.phase === 'error') {
    return (
      <>
        <CenterMessage title="기록할 수 없어요" description={state.message} />
        {state.canRetry ? (
          <BottomAction label="다시 시도" variant="neutralWeak" onClick={onReload} />
        ) : null}
      </>
    );
  }
  if (state.phase === 'done') {
    return <PunchDone state={state} />;
  }
  return (
    <PunchReady
      preview={state.preview}
      pending={state.phase !== 'ready'}
      pendingLabel={state.phase === 'verifying' ? '기록됐는지 확인 중이에요' : undefined}
      onSubmit={() => onSubmit(state.preview)}
    />
  );
}

interface PunchReadyProps {
  preview: PunchPreviewDto;
  pending: boolean;
  pendingLabel?: string;
  onSubmit: () => void;
}

function PunchReady({ preview, pending, pendingLabel, onSubmit }: PunchReadyProps) {
  const now = useNow(preview.serverNow);
  const label = ACTION_LABEL[preview.nextAction];
  const working = preview.openAttendance;

  return (
    <>
      <section className="punch-center" aria-live="polite">
        <Text as="p" textStyle="t5Medium" color="fg.neutralMuted">
          {preview.store.name}
        </Text>
        <Text as="h1" textStyle="t10Bold">
          {formatClock(now.toISOString())}
        </Text>
        {working ? (
          <Text as="p" textStyle="t5Regular" color="fg.neutralMuted">
            {formatClock(working.clockInAt)} 출근 ·{' '}
            {formatDuration(now.getTime() - new Date(working.clockInAt).getTime())} 근무 중
          </Text>
        ) : null}
        {/* 확인 중 문구 줄은 늘 잡아 두어, 생길 때 시각이 위로 밀리지 않게 한다 */}
        <Text as="p" textStyle="t4Regular" color="fg.neutralMuted">
          {pendingLabel ?? TEXT_PLACEHOLDER}
        </Text>
      </section>
      <BottomAction label={`${label}하기`} loading={pending} onClick={onSubmit} />
    </>
  );
}

function PunchDone({ state }: { state: Extract<PunchState, { phase: 'done' }> }) {
  const label = ACTION_LABEL[state.action];
  const { attendance } = state;
  const punchedAt =
    state.action === 'CLOCK_IN' ? attendance?.clockInAt : (attendance?.clockOutAt ?? undefined);
  const workedMs =
    attendance?.clockOutAt != null
      ? new Date(attendance.clockOutAt).getTime() - new Date(attendance.clockInAt).getTime()
      : null;

  return (
    <>
      <section className="punch-center" aria-live="polite">
        {/* 상태가 바뀐 순간 한 번 — 마크가 톡 커지고 문구가 이어서 올라온다. 아래 확인 버튼은 바로 누를 수 있다 */}
        <SuccessEntrance>
          <SuccessEntranceMark>
            <KokMark />
          </SuccessEntranceMark>
          <SuccessEntranceItem>
            <Text as="h1" textStyle="t10Bold">
              콕! {label} 완료
            </Text>
          </SuccessEntranceItem>
          <SuccessEntranceItem>
            <Text as="p" textStyle="t5Regular" color="fg.neutralMuted">
              {state.storeName}
            </Text>
          </SuccessEntranceItem>
          <SuccessEntranceItem>
            <Text as="p" textStyle="t5Regular" color="fg.neutralMuted">
              {punchedAt ? `${formatClock(punchedAt)} ${label}` : `${label}이 기록됐어요`}
              {workedMs != null ? ` · ${formatDuration(workedMs)} 근무` : null}
            </Text>
          </SuccessEntranceItem>
        </SuccessEntrance>
      </section>
      {/* 퇴근하면 휴게를 못 쓴 날을 바로 알릴 수 있게. 휴게를 직접 남긴 근무는 빼고 (docs/specs/attendance §3.4·§3.6·§7.2) */}
      {state.action === 'CLOCK_OUT' && attendance && !state.breakRecorded ? (
        <ActionButton asChild variant="ghost" size="medium">
          <Link href={`/me/attendances/${attendance.id}`}>휴게 못 했어요</Link>
        </ActionButton>
      ) : null}
      <div className="punch-bottom">
        <ActionButton asChild variant="neutralSolid" size="large" flexGrow>
          <Link href="/me">확인</Link>
        </ActionButton>
      </div>
    </>
  );
}

function CenterMessage({ title, description }: { title: string; description?: string }) {
  return (
    <section className="punch-center" aria-live="polite">
      <Text as="h1" textStyle="t7Bold">
        {title}
      </Text>
      {description ? (
        <Text as="p" textStyle="t5Regular" color="fg.neutralMuted" align="center">
          {description}
        </Text>
      ) : null}
    </section>
  );
}

interface BottomActionProps {
  label: string;
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'neutralSolid' | 'neutralWeak';
}

function BottomAction({ label, onClick, loading, disabled, variant = 'neutralSolid' }: BottomActionProps) {
  return (
    <div className="punch-bottom">
      <ActionButton variant={variant} size="large" flexGrow loading={loading} disabled={disabled} onClick={onClick}>
        {label}
      </ActionButton>
    </div>
  );
}

/** 서버 시각 기준 현재 시각. 기기 시계가 틀려도 화면 시각은 서버를 따른다 */
function useNow(serverNow: string): Date {
  const [offsetMs] = useState(() => new Date(serverNow).getTime() - Date.now());
  const [now, setNow] = useState(() => new Date(serverNow));
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date(Date.now() + offsetMs)), CLOCK_TICK_MS);
    return () => clearInterval(timer);
  }, [offsetMs]);
  return now;
}
