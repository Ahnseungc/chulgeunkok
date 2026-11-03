'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';

import { apiFetch, ApiRequestError } from '@/shared/lib/api-client';

import type { SendOtpResultDto, VerifyOtpResultDto } from '../model/me-types';

const NETWORK_ERROR_MESSAGE = '연결이 불안정해요. 잠시 후 다시 시도해 주세요.';
const AFTER_LOGIN_PATH = '/owner';

export type OwnerLoginStep =
  | { step: 'phone' }
  | { step: 'code'; phone: string; devCode: string | null }
  | { step: 'name' };

const messageOf = (error: unknown) =>
  error instanceof ApiRequestError ? error.message : NETWORK_ERROR_MESSAGE;

/** 사장님 휴대폰 인증 단계: 번호 → 인증번호 → (처음이면) 이름. docs/specs/auth §4 */
export function useOwnerLogin() {
  const router = useRouter();
  const [state, setState] = useState<OwnerLoginStep>({ step: 'phone' });
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  /** 요청 하나를 감싸 대기·오류 표시를 한곳에서 처리한다 */
  const run = useCallback(async (request: () => Promise<void>) => {
    setPending(true);
    setErrorMessage(null);
    try {
      await request();
    } catch (error) {
      setErrorMessage(messageOf(error));
    } finally {
      setPending(false);
    }
  }, []);

  const sendCode = (phone: string) =>
    run(async () => {
      const result = await apiFetch<SendOtpResultDto>('/api/v1/auth/otp/send', {
        method: 'POST',
        body: JSON.stringify({ phone }),
      });
      setState({ step: 'code', phone, devCode: result.devCode ?? null });
    });

  const verifyCode = (phone: string, code: string) =>
    run(async () => {
      const result = await apiFetch<VerifyOtpResultDto>('/api/v1/auth/otp/verify', {
        method: 'POST',
        body: JSON.stringify({ phone, code }),
      });
      if (result.needsName) setState({ step: 'name' });
      else router.replace(AFTER_LOGIN_PATH);
    });

  const saveName = (name: string) =>
    run(async () => {
      await apiFetch('/api/v1/me', { method: 'PATCH', body: JSON.stringify({ name }) });
      router.replace(AFTER_LOGIN_PATH);
    });

  const restart = () => {
    setErrorMessage(null);
    setState({ step: 'phone' });
  };

  return { state, pending, errorMessage, sendCode, verifyCode, saveName, restart };
}
