'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';

import { apiFetch, ApiRequestError } from '@/shared/lib/api-client';
import { notifyDeviceRegistered } from '@/shared/lib/app-shell';

import type { SendOtpResultDto, VerifyOtpResultDto } from '../model/me-types';

const NETWORK_ERROR_MESSAGE = '연결이 불안정해요. 잠시 후 다시 시도해 주세요.';

export type OwnerLoginStep =
  | { step: 'phone' }
  | { step: 'code'; phone: string; devCode: string | null }
  | { step: 'name' };

const messageOf = (error: unknown) =>
  error instanceof ApiRequestError ? error.message : NETWORK_ERROR_MESSAGE;

interface OwnerLoginOptions {
  /** 지금 기기 세션에 번호만 붙인다 (급여 권한 Manager, docs/specs/auth §4.2). 기기를 새로 등록하지 않는다 */
  attach: boolean;
  /** 인증 뒤 갈 화면 (afterLoginPath 로 검증한 값) */
  nextPath: string;
}

/** 사장님 휴대폰 인증 단계: 번호 → 인증번호 → (처음이면) 이름. docs/specs/auth §4 */
export function useOwnerLogin({ attach, nextPath }: OwnerLoginOptions) {
  const router = useRouter();
  const goNext = () => router.replace(nextPath as Parameters<typeof router.replace>[0]);
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
        body: JSON.stringify({ phone, code, ...(attach ? { attach: true } : {}) }),
      });
      // 번호만 붙였으면 기기가 그대로라 앱에 알릴 것이 없다
      if (!attach) await notifyDeviceRegistered();
      if (result.needsName) setState({ step: 'name' });
      else goNext();
    });

  const saveName = (name: string) =>
    run(async () => {
      await apiFetch('/api/v1/me', { method: 'PATCH', body: JSON.stringify({ name }) });
      goNext();
    });

  const restart = () => {
    setErrorMessage(null);
    setState({ step: 'phone' });
  };

  return { state, pending, errorMessage, sendCode, verifyCode, saveName, restart };
}
