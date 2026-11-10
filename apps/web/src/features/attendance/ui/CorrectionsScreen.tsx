'use client';

import { ActionButton, Text } from '@seed-design/react';
import { useState } from 'react';

import { toLocalDate } from '@/features/payroll/model/work-time';
import { apiFetch } from '@/shared/lib/api-client';
import { formatClock, formatLocalDate } from '@/shared/lib/format-time';
import { errorMessageOf, useApiResource } from '@/shared/lib/useApiResource';
import { CardStaggerList } from '@/shared/motion/CardStaggerList';
import LabeledTextField from '@/shared/ui/LabeledTextField';
import Sheet from '@/shared/ui/Sheet';

import type { CorrectionDto } from '../model/attendance-admin-types';

import { CORRECTION_TYPE_LABEL } from './correction-labels';
import { AppLink } from '@/shared/ui/AppLink';
import InlineAlert from '@/shared/ui/InlineAlert';
import ScreenHeader from '@/shared/ui/ScreenHeader';

const NOTE_MAX_LENGTH = 200;

/** `/owner/[storeId]/corrections` — 직원 수정 요청 승인·반려 (docs/specs/attendance §7.3) */
export default function CorrectionsScreen({ storeId }: { storeId: string }) {
  const { data, errorMessage, reload } = useApiResource<{ requests: CorrectionDto[] }>(
    `/api/v1/stores/${storeId}/correction-requests?status=PENDING`,
  );
  const [rejecting, setRejecting] = useState<CorrectionDto | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const approve = async (request: CorrectionDto) => {
    setActionError(null);
    try {
      await apiFetch(`/api/v1/correction-requests/${request.id}/approve`, { method: 'POST', body: '{}' });
      await reload();
    } catch (error) {
      setActionError(errorMessageOf(error));
    }
  };

  return (
    <main className="screen">
      <ScreenHeader backHref={`/owner/${storeId}`} backLabel="매장 홈" title="수정 요청" />
      <Text as="h1" textStyle="t8Bold">
        수정 요청
      </Text>
      <InlineAlert message={errorMessage ?? actionError} />
      {data && data.requests.length === 0 ? (
        <Text as="p" textStyle="t5Regular" color="fg.neutralMuted">
          확인할 요청이 없어요
        </Text>
      ) : null}
      {/* 승인·반려한 요청은 접히며 빠지고 아래 요청이 따라 올라온다 */}
      <CardStaggerList
        className="store-list"
        items={data?.requests ?? []}
        getKey={(request) => request.id}
        renderItem={(request) => (
          <div className="store-list__item">
            <div className="member-row">
              <Text textStyle="t5Bold">{request.memberName}</Text>
              <Text textStyle="t4Regular" color="fg.neutralMuted">
                {formatLocalDate(toLocalDate(new Date(request.attendance.clockInAt)))} · {CORRECTION_TYPE_LABEL[request.type]}
              </Text>
            </div>
            <Text textStyle="t4Regular">{describeChange(request)}</Text>
            <Text textStyle="t4Regular" color="fg.neutralMuted">
              “{request.reason}”
            </Text>
            <div className="sheet__actions">
              <ActionButton variant="neutralWeak" size="medium" flexGrow onClick={() => setRejecting(request)}>
                반려
              </ActionButton>
              <ActionButton variant="neutralSolid" size="medium" flexGrow onClick={() => void approve(request)}>
                승인
              </ActionButton>
            </div>
            <AppLink href={`/owner/${storeId}/attendances/${request.attendanceId}`} className="back-link">
              <Text textStyle="t3Regular" color="fg.neutralMuted">
                기록 보기 (시각을 고쳐서 처리하기)
              </Text>
            </AppLink>
          </div>
        )}
      />
      <RejectSheet
        request={rejecting}
        onClose={() => setRejecting(null)}
        onDone={async () => {
          setRejecting(null);
          await reload();
        }}
      />
    </main>
  );
}

/** 지금 기록 → 요청한 값 */
function describeChange(request: CorrectionDto): string {
  const current = `${formatClock(request.attendance.clockInAt)} ~ ${request.attendance.clockOutAt ? formatClock(request.attendance.clockOutAt) : '없음'}`;
  if (request.type === 'BREAK_WAIVED') return `${current} · 휴게시간을 빼지 말아 주세요`;
  const proposedIn = request.proposedClockInAt ?? request.attendance.clockInAt;
  const proposedOut = request.proposedClockOutAt ?? request.attendance.clockOutAt;
  return `${current} → ${formatClock(proposedIn)} ~ ${proposedOut ? formatClock(proposedOut) : '없음'}`;
}

interface RejectSheetProps {
  request: CorrectionDto | null;
  onClose: () => void;
  onDone: () => Promise<void>;
}

function RejectSheet({ request, onClose, onDone }: RejectSheetProps) {
  const [note, setNote] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const reject = async () => {
    if (!request) return;
    try {
      await apiFetch(`/api/v1/correction-requests/${request.id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ decisionNote: note.trim() }),
      });
      setNote('');
      await onDone();
    } catch (error) {
      setErrorMessage(errorMessageOf(error));
    }
  };

  return (
    <Sheet open={request !== null} onClose={onClose} title="반려 사유를 알려 주세요">
      <Text as="p" textStyle="t4Regular" color="fg.neutralMuted">
        직원에게 그대로 보여요.
      </Text>
      <LabeledTextField label="사유" value={note} onValueChange={setNote} maxLength={NOTE_MAX_LENGTH} placeholder="예: 그날은 22시에 마감했어요" />
      {errorMessage ? (
        <Text as="p" textStyle="t4Regular" color="fg.critical" role="alert">
          {errorMessage}
        </Text>
      ) : null}
      <div className="sheet__actions">
        <ActionButton variant="neutralWeak" size="large" flexGrow onClick={onClose}>
          취소
        </ActionButton>
        <ActionButton variant="criticalSolid" size="large" flexGrow disabled={!note.trim()} onClick={() => void reject()}>
          반려
        </ActionButton>
      </div>
    </Sheet>
  );
}
