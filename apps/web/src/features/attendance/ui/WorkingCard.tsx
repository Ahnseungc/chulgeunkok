'use client';

import { ActionButton, Text } from '@seed-design/react';
import { useState } from 'react';

import { apiFetch } from '@/shared/lib/api-client';
import { formatClock, formatDuration } from '@/shared/lib/format-time';
import { errorMessageOf } from '@/shared/lib/useApiResource';
import { useServerNow } from '@/shared/lib/useServerNow';
import { useToast } from '@/shared/ui/useToast';

import type { MyAttendancesDto } from '../model/my-attendance-types';
import type { BreakResultDto } from '../model/punch-types';

interface WorkingCardProps {
  storeId: string;
  storeName: string;
  working: NonNullable<MyAttendancesDto['working']>;
  serverNow: string;
  onChanged: () => Promise<void>;
}

const breakLength = (result: BreakResultDto) =>
  formatDuration(new Date(result.break.endAt ?? result.break.startAt).getTime() - new Date(result.break.startAt).getTime());

/** `/me` 근무 중 카드 + 휴게 시작·끝 (docs/specs/attendance §3.6, §8). QR 없이 서버 시각으로 남긴다 */
export default function WorkingCard({ storeId, storeName, working, serverNow, onChanged }: WorkingCardProps) {
  const now = useServerNow(serverNow);
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const onBreak = working.breakStartedAt !== null;

  const handleToggleBreak = async () => {
    setPending(true);
    try {
      const result = await apiFetch<BreakResultDto>(`/api/v1/attendance/break/${onBreak ? 'end' : 'start'}`, {
        method: 'POST',
        body: JSON.stringify({ storeId }),
      });
      toast.success(onBreak ? `휴게 ${breakLength(result)}을 남겼어요` : '휴게를 시작했어요');
    } catch (error) {
      toast.error(errorMessageOf(error));
    }
    // 실패해도 다른 기기에서 바뀐 상태일 수 있어 다시 불러온다
    try {
      await onChanged();
    } catch (error) {
      toast.error(errorMessageOf(error));
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="dash-card" aria-label="지금 근무 중">
      <Text textStyle="t6Bold">{storeName}에서 근무 중</Text>
      <Text textStyle="t4Regular" color="fg.neutralMuted">
        {formatClock(working.clockInAt)} 출근 · 퇴근할 때 매장 QR을 다시 찍어 주세요
      </Text>
      {working.breakStartedAt ? (
        <Text textStyle="t5Bold" role="status">
          휴게 중 · {formatDuration(now.getTime() - new Date(working.breakStartedAt).getTime())}
        </Text>
      ) : null}
      <ActionButton variant={onBreak ? 'neutralSolid' : 'neutralWeak'} size="medium" loading={pending} onClick={() => void handleToggleBreak()}>
        {onBreak ? '휴게 끝' : '휴게 시작'}
      </ActionButton>
    </section>
  );
}
