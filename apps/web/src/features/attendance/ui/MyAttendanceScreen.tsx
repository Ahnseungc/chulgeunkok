'use client';

import { ActionButton, Text } from '@seed-design/react';
import Link from 'next/link';
import { useState } from 'react';

import { apiFetch } from '@/shared/lib/api-client';
import { formatClock, formatDuration, formatLocalDate, fromLocalDateTimeInput, toLocalDateTimeInput } from '@/shared/lib/format-time';
import { errorMessageOf, useApiResource } from '@/shared/lib/useApiResource';
import LabeledTextField from '@/shared/ui/LabeledTextField';

import type { AttendanceDetailDto } from '../model/attendance-admin-types';
import { DEFAULT_BREAK_WAIVED_REASON } from '../model/my-attendance-types';

import { AttendanceBadges } from './AttendancesScreen';
import { CORRECTION_STATUS_LABEL, CORRECTION_TYPE_LABEL } from './correction-labels';

const SECOND_MS = 1000;
const REASON_MAX_LENGTH = 200;

/** `/me/attendances/[id]` — 내 근무 상세와 수정 요청 (docs/specs/attendance §7.1·§7.2) */
export default function MyAttendanceScreen({ attendanceId }: { attendanceId: string }) {
  const path = `/api/v1/attendances/${attendanceId}`;
  const detail = useApiResource<AttendanceDetailDto>(path, { loginPath: null });
  const data = detail.data;
  const pending = data?.corrections.find((correction) => correction.status === 'PENDING');

  return (
    <main className="screen">
      <Link href="/me" className="back-link">
        ← 내 근무
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
              {formatLocalDate(data.localDate)}
            </Text>
            <Text textStyle="t5Regular">
              {formatClock(data.clockInAt)} ~ {data.clockOutAt ? formatClock(data.clockOutAt) : '퇴근 기록 없음'}
            </Text>
            {data.status === 'CLOSED' ? (
              <Text textStyle="t4Regular" color="fg.neutralMuted">
                휴게 {formatDuration(data.breakSeconds * SECOND_MS)} 빼고 {formatDuration(data.recognizedSeconds * SECOND_MS)} 인정
              </Text>
            ) : null}
            <AttendanceBadges row={data} />
          </header>
          {pending ? null : <RequestForms detail={data} onDone={detail.reload} />}
          <CorrectionHistory detail={data} onChanged={detail.reload} />
        </>
      ) : null}
    </main>
  );
}

function RequestForms({ detail, onDone }: { detail: AttendanceDetailDto; onDone: () => Promise<void> }) {
  const [clockIn, setClockIn] = useState(toLocalDateTimeInput(detail.clockInAt));
  const [clockOut, setClockOut] = useState(detail.clockOutAt ? toLocalDateTimeInput(detail.clockOutAt) : '');
  const [reason, setReason] = useState('');
  const [breakReason, setBreakReason] = useState(DEFAULT_BREAK_WAIVED_REASON);
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const send = async (body: Record<string, unknown>) => {
    setPending(true);
    setErrorMessage(null);
    try {
      await apiFetch(`/api/v1/attendances/${detail.id}/correction-requests`, { method: 'POST', body: JSON.stringify(body) });
      await onDone();
    } catch (error) {
      setErrorMessage(errorMessageOf(error));
    } finally {
      setPending(false);
    }
  };

  if (detail.status === 'VOID' || detail.status === 'OPEN') return null;
  const isMissing = detail.status === 'MISSING_CLOCK_OUT';

  return (
    <>
      {detail.status === 'CLOSED' && !detail.breakWaived ? (
        <section className="detail-section" aria-labelledby="break-heading">
          <Text as="h2" id="break-heading" textStyle="t6Bold">
            휴게를 못 썼나요?
          </Text>
          <Text textStyle="t4Regular" color="fg.neutralMuted">
            사장님이 확인하면 휴게시간을 빼지 않고 계산해요.
          </Text>
          <LabeledTextField label="사유" value={breakReason} onValueChange={setBreakReason} maxLength={REASON_MAX_LENGTH} />
          <ActionButton
            variant="neutralSolid"
            size="medium"
            loading={pending}
            disabled={!breakReason.trim()}
            onClick={() => void send({ type: 'BREAK_WAIVED', reason: breakReason.trim() })}
          >
            휴게 못 했다고 알리기
          </ActionButton>
        </section>
      ) : null}
      <section className="detail-section" aria-labelledby="time-heading">
        <Text as="h2" id="time-heading" textStyle="t6Bold">
          {isMissing ? '퇴근 시각을 알려 주세요' : '시각이 틀렸나요?'}
        </Text>
        {isMissing ? null : <LabeledTextField label="출근" type="datetime-local" value={clockIn} onValueChange={setClockIn} />}
        <LabeledTextField label="퇴근" type="datetime-local" value={clockOut} onValueChange={setClockOut} />
        <LabeledTextField
          label="사유"
          value={reason}
          onValueChange={setReason}
          maxLength={REASON_MAX_LENGTH}
          placeholder={isMissing ? '예: 퇴근할 때 QR 찍는 걸 잊었어요' : '예: 출근 QR을 늦게 찍었어요'}
        />
        <ActionButton
          variant="neutralSolid"
          size="medium"
          loading={pending}
          disabled={!reason.trim() || !clockOut}
          onClick={() =>
            void send(
              isMissing
                ? { type: 'MISSING_CLOCK_OUT', proposedClockOutAt: fromLocalDateTimeInput(clockOut), reason: reason.trim() }
                : {
                    type: 'TIME',
                    proposedClockInAt: fromLocalDateTimeInput(clockIn),
                    proposedClockOutAt: fromLocalDateTimeInput(clockOut),
                    reason: reason.trim(),
                  },
            )
          }
        >
          사장님께 요청하기
        </ActionButton>
      </section>
      {errorMessage ? (
        <Text as="p" textStyle="t4Regular" color="fg.critical" role="alert">
          {errorMessage}
        </Text>
      ) : null}
    </>
  );
}

function CorrectionHistory({ detail, onChanged }: { detail: AttendanceDetailDto; onChanged: () => Promise<void> }) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  if (detail.corrections.length === 0) return null;

  const cancel = async (requestId: string) => {
    try {
      await apiFetch(`/api/v1/correction-requests/${requestId}/cancel`, { method: 'POST', body: '{}' });
      await onChanged();
    } catch (error) {
      setErrorMessage(errorMessageOf(error));
    }
  };

  return (
    <section className="detail-section" aria-labelledby="requests-heading">
      <Text as="h2" id="requests-heading" textStyle="t6Bold">
        보낸 요청
      </Text>
      <ul className="review-list">
        {detail.corrections.map((correction) => (
          <li key={correction.id} className="review-list__item">
            <Text textStyle="t5Bold">
              {CORRECTION_TYPE_LABEL[correction.type]} · {CORRECTION_STATUS_LABEL[correction.status]}
            </Text>
            <Text textStyle="t4Regular" color="fg.neutralMuted">
              {correction.reason}
              {correction.decisionNote ? ` → 사장님: ${correction.decisionNote}` : ''}
            </Text>
            {correction.status === 'PENDING' ? (
              <ActionButton variant="ghost" size="small" onClick={() => void cancel(correction.id)}>
                요청 취소
              </ActionButton>
            ) : null}
          </li>
        ))}
      </ul>
      {errorMessage ? (
        <Text as="p" textStyle="t4Regular" color="fg.critical" role="alert">
          {errorMessage}
        </Text>
      ) : null}
    </section>
  );
}
