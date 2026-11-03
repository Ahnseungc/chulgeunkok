'use client';

import { useCallback, useEffect, useState } from 'react';

import { apiFetch, ApiRequestError } from '@/shared/lib/api-client';

import type { AcceptInvitationResultDto, InvitationInfoDto } from '../model/invitation-types';

const NETWORK_ERROR_MESSAGE = '연결이 불안정해요. 잠시 후 다시 시도해 주세요.';

export type InviteState =
  | { phase: 'loading' }
  | { phase: 'invalid'; message: string }
  | { phase: 'ready'; info: InvitationInfoDto; errorMessage: string | null }
  | { phase: 'submitting'; info: InvitationInfoDto }
  | { phase: 'done'; result: AcceptInvitationResultDto };

const messageOf = (error: unknown) =>
  error instanceof ApiRequestError ? error.message : NETWORK_ERROR_MESSAGE;

/** 초대 수락 화면 상태. docs/specs/staff §3.2·§3.3 */
export function useInvite(token: string) {
  const [state, setState] = useState<InviteState>({ phase: 'loading' });
  const invitationPath = `/api/v1/invitations/${encodeURIComponent(token)}`;

  useEffect(() => {
    apiFetch<InvitationInfoDto>(invitationPath)
      .then((info) => setState({ phase: 'ready', info, errorMessage: null }))
      .catch((error: unknown) => setState({ phase: 'invalid', message: messageOf(error) }));
  }, [invitationPath]);

  const accept = useCallback(
    async (info: InvitationInfoDto, name: string) => {
      setState({ phase: 'submitting', info });
      try {
        const result = await apiFetch<AcceptInvitationResultDto>(`${invitationPath}/accept`, {
          method: 'POST',
          body: JSON.stringify(info.needsName ? { name } : {}),
        });
        setState({ phase: 'done', result });
      } catch (error) {
        // 이름 누락 등은 같은 화면에서 고칠 수 있다. 사용·만료된 초대는 처음 화면으로
        const recoverable = error instanceof ApiRequestError && error.code === 'VALIDATION_FAILED';
        setState(
          recoverable
            ? { phase: 'ready', info, errorMessage: messageOf(error) }
            : { phase: 'invalid', message: messageOf(error) },
        );
      }
    },
    [invitationPath],
  );

  return { state, accept };
}
