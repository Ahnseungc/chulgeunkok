'use client';

import { ActionButton, Text } from '@seed-design/react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { apiFetch } from '@/shared/lib/api-client';
import {
  formatClock,
  formatDuration,
  formatLocalDate,
  fromLocalDateTimeInput,
  toLocalDateTimeInput,
} from '@/shared/lib/format-time';
import { errorMessageOf, useApiResource } from '@/shared/lib/useApiResource';
import LabeledTextField from '@/shared/ui/LabeledTextField';

import type { AttendanceDetailDto, AttendanceSnapshot } from '../model/attendance-admin-types';

import { AttendanceBadges } from './AttendancesScreen';

const SECOND_MS = 1000;
const REASON_MAX_LENGTH = 200;

interface AttendanceDetailScreenProps {
  storeId: string;
  attendanceId: string;
}

/** `/owner/[storeId]/attendances/[id]` — 관리자 직접 수정·무효 처리·변경 이력 (docs/specs/attendance §7.4) */
export default function AttendanceDetailScreen({ storeId, attendanceId }: AttendanceDetailScreenProps) {
  const path = `/api/v1/attendances/${attendanceId}`;
  const detail = useApiResource<AttendanceDetailDto>(path);
  const data = detail.data;

  return (
    <main className="screen">
      <Link href={`/owner/${storeId}/attendances`} className="back-link">
        ← 근태 기록
      </Link>
      {detail.errorMessage ? (
        <Text as="p" textStyle="t5Regular" color="fg.critical" role="alert">
          {detail.errorMessage}
        </Text>
      ) : null}
      {data ? (
        <>
          <header className="member-header">
            <Text as="h1" textStyle="t8Bold">
              {data.name} · {formatLocalDate(data.localDate)}
            </Text>
            <Text textStyle="t5Regular">
              {formatClock(data.clockInAt)} ~ {data.clockOutAt ? formatClock(data.clockOutAt) : '퇴근 기록 없음'}
            </Text>
            {data.status === 'CLOSED' ? (
              <Text textStyle="t4Regular" color="fg.neutralMuted">
                근무 {formatDuration(data.workedSeconds * SECOND_MS)} · 휴게 {formatDuration(data.breakSeconds * SECOND_MS)} · 인정{' '}
                {formatDuration(data.recognizedSeconds * SECOND_MS)}
              </Text>
            ) : null}
            <AttendanceBadges row={data} />
          </header>
          {data.status !== 'VOID' ? <EditForm detail={data} path={path} onSaved={detail.reload} /> : null}
          <RevisionList detail={data} />
        </>
      ) : null}
    </main>
  );
}

interface EditFormProps {
  detail: AttendanceDetailDto;
  path: string;
  onSaved: () => Promise<void>;
}

function EditForm({ detail, path, onSaved }: EditFormProps) {
  const [clockIn, setClockIn] = useState('');
  const [clockOut, setClockOut] = useState('');
  const [breakWaived, setBreakWaived] = useState(false);
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  // 저장 후 다시 불러온 값으로 폼을 맞춘다
  useEffect(() => {
    setClockIn(toLocalDateTimeInput(detail.clockInAt));
    setClockOut(detail.clockOutAt ? toLocalDateTimeInput(detail.clockOutAt) : '');
    setBreakWaived(detail.breakWaived);
  }, [detail]);

  const submit = async (change: Record<string, unknown>) => {
    setPending(true);
    setMessage(null);
    try {
      await apiFetch(path, { method: 'PATCH', body: JSON.stringify({ ...change, reason: reason.trim() }) });
      setReason('');
      setMessage({ text: '저장했어요', error: false });
      await onSaved();
    } catch (error) {
      setMessage({ text: errorMessageOf(error), error: true });
    } finally {
      setPending(false);
    }
  };
  const hasReason = reason.trim().length > 0;

  return (
    <section className="detail-section" aria-labelledby="edit-heading">
      <Text as="h2" id="edit-heading" textStyle="t6Bold">
        {detail.status === 'MISSING_CLOCK_OUT' ? '퇴근 시각 넣기' : '기록 고치기'}
      </Text>
      <LabeledTextField label="출근" type="datetime-local" value={clockIn} onValueChange={setClockIn} />
      <LabeledTextField label="퇴근" type="datetime-local" value={clockOut} onValueChange={setClockOut} />
      <label className="checkbox-row">
        <input type="checkbox" checked={breakWaived} onChange={(event) => setBreakWaived(event.target.checked)} />
        <Text as="span" textStyle="t4Regular">
          휴게를 못 썼어요 (휴게시간을 빼지 않아요)
        </Text>
      </label>
      <LabeledTextField
        label="고치는 이유 (기록에 남아요)"
        value={reason}
        onValueChange={setReason}
        maxLength={REASON_MAX_LENGTH}
        placeholder="예: 퇴근 찍는 걸 잊었어요"
      />
      {message ? (
        <Text as="p" textStyle="t4Regular" color={message.error ? 'fg.critical' : 'fg.positive'} role="status">
          {message.text}
        </Text>
      ) : null}
      <div className="sheet__actions">
        <ActionButton
          variant="criticalSolid"
          size="medium"
          disabled={!hasReason || pending}
          onClick={() => void submit({ status: 'VOID' })}
        >
          무효 처리
        </ActionButton>
        <ActionButton
          variant="neutralSolid"
          size="medium"
          flexGrow
          loading={pending}
          disabled={!hasReason || !clockIn}
          onClick={() =>
            void submit({
              clockInAt: fromLocalDateTimeInput(clockIn),
              ...(clockOut ? { clockOutAt: fromLocalDateTimeInput(clockOut) } : {}),
              breakWaived,
            })
          }
        >
          저장
        </ActionButton>
      </div>
    </section>
  );
}

const describeSnapshot = (snapshot: AttendanceSnapshot | null) =>
  snapshot
    ? `${formatClock(snapshot.clockInAt)} ~ ${snapshot.clockOutAt ? formatClock(snapshot.clockOutAt) : '없음'}${snapshot.status === 'VOID' ? ' (무효)' : ''}${snapshot.breakWaived ? ' · 휴게 못 함' : ''}`
    : '없음';

function RevisionList({ detail }: { detail: AttendanceDetailDto }) {
  if (detail.revisions.length === 0) return null;
  return (
    <section className="detail-section" aria-labelledby="revisions-heading">
      <Text as="h2" id="revisions-heading" textStyle="t6Bold">
        변경 이력
      </Text>
      <ul className="review-list">
        {detail.revisions.map((revision) => (
          <li key={revision.id} className="review-list__item">
            <Text textStyle="t4Bold">
              {revision.actorName} · {new Date(revision.createdAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}
            </Text>
            <Text textStyle="t4Regular" color="fg.neutralMuted">
              {describeSnapshot(revision.before)} → {describeSnapshot(revision.after)}
            </Text>
            <Text textStyle="t4Regular">{revision.reason}</Text>
          </li>
        ))}
      </ul>
    </section>
  );
}
