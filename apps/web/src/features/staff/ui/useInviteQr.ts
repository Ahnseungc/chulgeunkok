'use client';

import { useCallback, useEffect, useState } from 'react';

import { apiFetch } from '@/shared/lib/api-client';
import { errorMessageOf } from '@/shared/lib/useApiResource';

import type { CreateInvitationResultDto } from '../model/invitation-types';

const COUNTDOWN_TICK_MS = 1000;

export type InviteTarget = { kind: 'JOIN' } | { kind: 'REREGISTER'; memberId: string };

/**
 * 직원 등록 QR(10분)·링크(7일). docs/specs/staff §3.1
 * 시트를 열 때 QR을 새로 만들고, 만료되면 다시 만들 수 있게 남은 시간을 센다.
 */
export function useInviteQr(input: { storeId: string; target: InviteTarget; open: boolean }) {
  const [qr, setQr] = useState<CreateInvitationResultDto | null>(null);
  const [remainingMs, setRemainingMs] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [linkMessage, setLinkMessage] = useState<string | null>(null);
  const { storeId, open } = input;
  // 객체 대신 원시값을 의존성으로 써서 렌더마다 QR을 다시 만들지 않는다
  const memberId = input.target.kind === 'REREGISTER' ? input.target.memberId : null;

  const createInvitation = useCallback(
    (delivery: 'QR' | 'LINK') =>
      apiFetch<CreateInvitationResultDto>(`/api/v1/stores/${storeId}/invitations`, {
        method: 'POST',
        body: JSON.stringify(
          memberId
            ? { kind: 'REREGISTER', memberId, delivery }
            : { kind: 'JOIN', role: 'EMPLOYEE', delivery },
        ),
      }),
    [storeId, memberId],
  );

  const refreshQr = useCallback(async () => {
    setErrorMessage(null);
    setLinkMessage(null);
    try {
      setQr(await createInvitation('QR'));
    } catch (error) {
      setQr(null);
      setErrorMessage(errorMessageOf(error));
    }
  }, [createInvitation]);

  useEffect(() => {
    if (open) void refreshQr();
    else setQr(null);
  }, [open, refreshQr]);

  useEffect(() => {
    if (!qr) return;
    const update = () => setRemainingMs(Math.max(0, new Date(qr.expiresAt).getTime() - Date.now()));
    update();
    const timer = setInterval(update, COUNTDOWN_TICK_MS);
    return () => clearInterval(timer);
  }, [qr]);

  /** 메신저로 보낼 7일짜리 링크. 공유 시트가 없으면 클립보드 */
  const shareLink = useCallback(async () => {
    try {
      const { url } = await createInvitation('LINK');
      if (navigator.share) {
        await navigator.share({ title: '출근콕 직원 등록', url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setLinkMessage('링크를 복사했어요. 7일 안에 열어야 해요.');
    } catch (error) {
      // 사용자가 공유 시트를 닫은 경우는 실패가 아니다
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setLinkMessage(errorMessageOf(error));
    }
  }, [createInvitation]);

  // 남은 시간 state가 첫 틱 전 0이라 만료를 시각으로 판단한다 (QR이 잠깐 만료로 깜빡이지 않게)
  const expired = qr !== null && new Date(qr.expiresAt).getTime() <= Date.now();
  return { qr, remainingMs, expired, errorMessage, linkMessage, refreshQr, shareLink };
}
