'use client';

import { ActionButton, Text } from '@seed-design/react';
import { useId, useState } from 'react';

import type { MemberSummaryDto } from '@/features/staff/model/member-types';
import { apiFetch } from '@/shared/lib/api-client';
import { fromLocalDateTimeInput, toStoreLocalDate } from '@/shared/lib/format-time';
import { errorMessageOf } from '@/shared/lib/useApiResource';
import InlineAlert from '@/shared/ui/InlineAlert';
import LabeledTextField from '@/shared/ui/LabeledTextField';
import Sheet from '@/shared/ui/Sheet';
import { useToast } from '@/shared/ui/useToast';

/** 서버 스키마(features/attendance/schema.ts Reason)와 같은 길이 */
const REASON_MAX_LENGTH = 200;
const DAY_MS = 24 * 60 * 60 * 1000;

interface AddAttendanceSheetProps {
  open: boolean;
  storeId: string;
  members: MemberSummaryDto[];
  /** 목록에서 고른 직원으로 미리 채운다 */
  initialMemberId?: string;
  onClose: () => void;
  onCreated: () => Promise<void>;
}

/**
 * 날짜·출근·퇴근(HH:mm, 매장 시간대) → ISO. 퇴근이 출근보다 이르거나 같으면 다음 날 퇴근으로 본다
 * (자정 넘는 근무. docs/specs/attendance §8)
 */
export function toAttendanceRange(date: string, clockIn: string, clockOut: string) {
  const clockInAt = fromLocalDateTimeInput(`${date}T${clockIn}`);
  const sameDayOut = new Date(fromLocalDateTimeInput(`${date}T${clockOut}`));
  const clockOutAt = clockOut > clockIn ? sameDayOut : new Date(sameDayOut.getTime() + DAY_MS);
  return { clockInAt, clockOutAt: clockOutAt.toISOString() };
}

/** 근태 기록 "근무 추가" — QR을 못 찍은 근무를 관리자가 만든다 (docs/specs/attendance §7.5) */
export default function AddAttendanceSheet({ open, onClose, ...formProps }: AddAttendanceSheetProps) {
  return (
    <Sheet open={open} onClose={onClose} title="빠진 근무 추가">
      {/* 열 때마다 빈 폼으로 시작한다 */}
      {open ? <AddAttendanceForm onClose={onClose} {...formProps} /> : null}
    </Sheet>
  );
}

function AddAttendanceForm({ storeId, members, initialMemberId, onClose, onCreated }: Omit<AddAttendanceSheetProps, 'open'>) {
  const toast = useToast();
  const memberSelectId = useId();
  const [memberId, setMemberId] = useState(initialMemberId ?? '');
  const [date, setDate] = useState(() => toStoreLocalDate(new Date()));
  const [clockIn, setClockIn] = useState('');
  const [clockOut, setClockOut] = useState('');
  const [breakWaived, setBreakWaived] = useState(false);
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const canSubmit = Boolean(memberId && date && clockIn && clockOut) && reason.trim().length > 0;

  const handleSubmit = async () => {
    setPending(true);
    setErrorMessage(null);
    try {
      const body = { memberId, ...toAttendanceRange(date, clockIn, clockOut), breakWaived, reason: reason.trim() };
      await apiFetch(`/api/v1/stores/${storeId}/attendances`, { method: 'POST', body: JSON.stringify(body) });
      toast.success('근무를 추가했어요');
      onClose();
      await onCreated();
    } catch (error) {
      setErrorMessage(errorMessageOf(error));
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <div className="labeled-field">
        <label htmlFor={memberSelectId}>
          <Text as="span" textStyle="t4Medium">
            직원
          </Text>
        </label>
        <select id={memberSelectId} className="native-select" value={memberId} onChange={(event) => setMemberId(event.target.value)}>
          <option value="">직원을 골라 주세요</option>
          {members.map((member) => (
            <option key={member.memberId} value={member.memberId}>
              {member.name}
            </option>
          ))}
        </select>
      </div>
      <LabeledTextField label="날짜" type="date" value={date} onValueChange={setDate} max={toStoreLocalDate(new Date())} />
      <LabeledTextField label="출근" type="time" value={clockIn} onValueChange={setClockIn} />
      <LabeledTextField label="퇴근" type="time" value={clockOut} onValueChange={setClockOut} />
      <Text as="p" textStyle="t4Regular" color="fg.neutralMuted">
        퇴근이 출근보다 이르면 다음 날 퇴근으로 넣어요
      </Text>
      <label className="checkbox-row">
        <input type="checkbox" checked={breakWaived} onChange={(event) => setBreakWaived(event.target.checked)} />
        <Text as="span" textStyle="t4Regular">
          휴게를 못 썼어요 (휴게시간을 빼지 않아요)
        </Text>
      </label>
      <LabeledTextField
        label="추가하는 이유 (기록에 남아요)"
        value={reason}
        onValueChange={setReason}
        maxLength={REASON_MAX_LENGTH}
        placeholder="예: QR을 못 찍었어요"
      />
      <InlineAlert message={errorMessage} textStyle="t4Regular" />
      <div className="sheet__actions">
        <ActionButton variant="neutralWeak" size="large" flexGrow onClick={onClose}>
          취소
        </ActionButton>
        <ActionButton
          variant="neutralSolid"
          size="large"
          flexGrow
          loading={pending}
          disabled={!canSubmit}
          onClick={() => void handleSubmit()}
        >
          추가
        </ActionButton>
      </div>
    </>
  );
}
