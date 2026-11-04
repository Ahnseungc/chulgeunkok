'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { apiFetch, ApiRequestError } from './api-client';

const OWNER_LOGIN_PATH = '/owner/login';
const NETWORK_ERROR_MESSAGE = '연결이 불안정해요. 잠시 후 다시 시도해 주세요.';

/**
 * 사장님 화면의 GET 조회. 미등록 기기면 휴대폰 인증으로 보낸다.
 * ponytail: 화면 수가 늘어 캐시·중복 요청이 문제가 되면 TanStack Query로 옮긴다.
 */
export function useApiResource<T>(path: string | null) {
  const router = useRouter();
  const [data, setData] = useState<T | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!path) return;
    try {
      setData(await apiFetch<T>(path));
      setErrorMessage(null);
    } catch (error) {
      if (error instanceof ApiRequestError && error.code === 'UNAUTHENTICATED') {
        router.replace(OWNER_LOGIN_PATH);
        return;
      }
      setErrorMessage(error instanceof ApiRequestError ? error.message : NETWORK_ERROR_MESSAGE);
    }
  }, [path, router]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, errorMessage, reload };
}

export const errorMessageOf = (error: unknown) =>
  error instanceof ApiRequestError ? error.message : NETWORK_ERROR_MESSAGE;
