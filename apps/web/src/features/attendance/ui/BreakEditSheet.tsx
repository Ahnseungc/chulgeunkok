'use client';

import { ActionButton, Text } from '@seed-design/react';
import { useRef, useState } from 'react';

import { apiFetch } from '@/shared/lib/api-client';
import { toStoreLocalDate } from '@/shared/lib/format-time';
import { errorMessageOf } from '@/shared/lib/useApiResource';
import InlineAlert from '@/shared/ui/InlineAlert';
import LabeledTextField from '@/shared/ui/LabeledTextField';
import Sheet from '@/shared/ui/Sheet';
import { useToast } from '@/shared/ui/useToast';

import type { AttendanceDetailDto } from '../model/attendance-admin-types';
import { type BreakDraft, isSameBreaks, resolveBreakDrafts, type ShiftRange, toBreakDrafts } from '../model/break-draft';
import { MAX_BREAKS_PER_ATTENDANCE } from '../schema';

/** 서버 스키마(features/attendance/schema.ts Reason)와 같은 길이 */
const REASON_MAX_LENGTH = 200;

interface BreakEditSheetProps {
  open: boolean;
  /** 퇴근까지 끝난 근무 (CLOSED) */
  detail: AttendanceDetailDto & ShiftRange;
  onClose: () => void;
  onSaved: () => Promise<void>;
}

/** 근태 상세 "휴게 고치기" — 끝난 근무의 휴게를 통째로 바꾼다 (docs/specs/attendance §7.6) */
export default function BreakEditSheet({ open, onClose, ...formProps }: BreakEditSheetProps) {
  return (
    <Sheet open={open} onClose={onClose} title="휴게 고치기">
      {/* 열 때마다 지금 기록으로 시작한다 */}
      {open ? <BreakEditForm onClose={onClose} {...formProps} /> : null}
    </Sheet>
  );
}

function BreakEditForm({ detail, onClose, onSaved }: Omit<BreakEditSheetProps, 'open'>) {
  const toast = useToast();
  const nextKey = useRef(0);
  const [drafts, setDrafts] = useState(() => toBreakDrafts(detail.breaks, detail));
  // 시트를 열 때 값. 손대지 않았으면 저장할 것이 없다
  const [initialBreaks] = useState(() => resolveBreakDrafts(drafts, detail).breaks);
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const result = resolveBreakDrafts(drafts, detail);
  const unchanged = isSameBreaks(result.breaks, initialBreaks);
  const crossesMidnight = toStoreLocalDate(new Date(detail.clockOutAt)) !== detail.localDate;

  const handleChange = (key: string, field: 'start' | 'end', value: string) =>
    setDrafts((current) => current.map((draft) => (draft.key === key ? { ...draft, [field]: value } : draft)));
  const handleAdd = () => {
    nextKey.current += 1;
    setDrafts((current) => [...current, { key: `new-${nextKey.current}`, start: '', end: '' }]);
  };
  const handleRemove = (key: string) => setDrafts((current) => current.filter((draft) => draft.key !== key));

  const handleSubmit = async () => {
    if (!result.breaks) return;
    setPending(true);
    setErrorMessage(null);
    try {
      const body = JSON.stringify({ breaks: result.breaks, reason: reason.trim() });
      await apiFetch(`/api/v1/attendances/${detail.id}/breaks`, { method: 'PUT', body });
      // 새 값을 받은 뒤 닫는다. 다시 불러오기 실패는 상세 화면 알림(useApiResource)에, 예외면 아래 catch 로 시트 안에 보인다
      await onSaved();
      toast.success('휴게를 고쳤어요');
      onClose();
    } catch (error) {
      setErrorMessage(errorMessageOf(error));
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      {drafts.length === 0 ? (
        <Text as="p" textStyle="t4Regular" color="fg.neutralMuted">
          남긴 휴게가 없어요. 이대로 저장하면 근로조건의 휴게시간을 빼요.
        </Text>
      ) : null}
      {drafts.map((draft, index) => (
        <BreakDraftRow key={draft.key} draft={draft} order={index + 1} onChange={handleChange} onRemove={handleRemove} />
      ))}
      <ActionButton variant="neutralWeak" size="medium" disabled={drafts.length >= MAX_BREAKS_PER_ATTENDANCE} onClick={handleAdd}>
        휴게 추가
      </ActionButton>
      <Text as="p" textStyle="t3Regular" color="fg.neutralMuted">
        1분이 안 되는 휴게는 정산에 넣지 않고, 저장하면 지워져요.
        {crossesMidnight ? ' 출근보다 이른 시각은 다음 날로 봐요.' : ''}
      </Text>
      <LabeledTextField
        label="고치는 이유 (기록에 남아요)"
        value={reason}
        onValueChange={setReason}
        maxLength={REASON_MAX_LENGTH}
        placeholder="예: 휴게 끝을 늦게 눌렀어요"
      />
      <InlineAlert message={errorMessage ?? result.error} textStyle="t4Regular" />
      <div className="sheet__actions">
        <ActionButton variant="neutralWeak" size="large" flexGrow onClick={onClose}>
          취소
        </ActionButton>
        <ActionButton
          variant="neutralSolid"
          size="large"
          flexGrow
          loading={pending}
          disabled={!result.breaks || unchanged || reason.trim().length === 0}
          onClick={() => void handleSubmit()}
        >
          저장
        </ActionButton>
      </div>
    </>
  );
}

interface BreakDraftRowProps {
  draft: BreakDraft;
  order: number;
  onChange: (key: string, field: 'start' | 'end', value: string) => void;
  onRemove: (key: string) => void;
}

function BreakDraftRow({ draft, order, onChange, onRemove }: BreakDraftRowProps) {
  return (
    <div className="break-edit-row">
      <LabeledTextField
        label={`휴게 ${order} 시작`}
        type="time"
        value={draft.start}
        onValueChange={(value) => onChange(draft.key, 'start', value)}
      />
      <LabeledTextField
        label={`휴게 ${order} 끝`}
        type="time"
        value={draft.end}
        onValueChange={(value) => onChange(draft.key, 'end', value)}
      />
      <ActionButton variant="neutralWeak" size="medium" aria-label={`휴게 ${order} 지우기`} onClick={() => onRemove(draft.key)}>
        지우기
      </ActionButton>
    </div>
  );
}
