'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { apiFetch, ApiRequestError } from './api-client';

const OWNER_LOGIN_PATH = '/owner/login';
const NETWORK_ERROR_MESSAGE = '연결이 불안정해요. 잠시 후 다시 시도해 주세요.';

interface ApiResourceOptions {
  /** 미등록 기기일 때 보낼 로그인 화면. null이면 이동하지 않고 오류 문구를 보여 준다 (직원 화면) */
  loginPath?: string | null;
}

/**
 * GET 조회. 기본은 사장님 화면이라 미등록 기기면 휴대폰 인증으로 보낸다.
 * ponytail: 화면 수가 늘어 캐시·중복 요청이 문제가 되면 TanStack Query로 옮긴다.
 */
export function useApiResource<T>(path: string | null, options: ApiResourceOptions = {}) {
  const loginPath = options.loginPath === undefined ? OWNER_LOGIN_PATH : options.loginPath;
  const router = useRouter();
  const [data, setData] = useState<T | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!path) return;
    try {
      setData(await apiFetch<T>(path));
      setErrorMessage(null);
    } catch (error) {
      if (loginPath && error instanceof ApiRequestError && error.code === 'UNAUTHENTICATED') {
        // 로그인 경로는 앱 안의 고정 경로다
        router.replace(loginPath as Parameters<typeof router.replace>[0]);
        return;
      }
      setErrorMessage(error instanceof ApiRequestError ? error.message : NETWORK_ERROR_MESSAGE);
    }
  }, [path, router, loginPath]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, errorMessage, reload };
}

/** 화면이 보이는 동안 일정 간격으로 다시 조회하고, 탭으로 돌아오면 바로 조회한다 */
export function usePolling(reload: () => Promise<void>, intervalMs: number) {
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void reload();
    }, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void reload();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [reload, intervalMs]);
}

export const errorMessageOf = (error: unknown) =>
  error instanceof ApiRequestError ? error.message : NETWORK_ERROR_MESSAGE;
