/** 서버 ApiError 응답(docs/specs/README.md §2.3)을 클라이언트 예외로 옮긴 것 */
export class ApiRequestError extends Error {
  readonly code: string;
  readonly status: number;
  /** 서버가 준 추가 정보 (예: MINIMUM_WAGE_CONFIRM_REQUIRED의 minimumHourlyWage) */
  readonly details?: Record<string, number | string>;

  constructor(input: { code: string; message: string; status: number; details?: Record<string, number | string> }) {
    super(input.message);
    this.name = 'ApiRequestError';
    this.code = input.code;
    this.status = input.status;
    this.details = input.details;
  }
}

const FALLBACK_MESSAGE = '일시적인 오류가 발생했어요.';

/**
 * 같은 출처 `/api/v1` 호출. 실패 응답은 ApiRequestError, 네트워크 실패는 fetch의 TypeError 그대로.
 * ponytail: 응답 본문은 우리 서버 DTO라 형태 검증 없이 쓴다. 외부 API를 부를 때는 Zod로 검증한다.
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...init.headers },
  });
  const json: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = (
      json as { error?: { code?: string; message?: string; details?: Record<string, number | string> } } | null
    )?.error;
    throw new ApiRequestError({
      code: error?.code ?? 'INTERNAL',
      message: error?.message ?? FALLBACK_MESSAGE,
      status: response.status,
      details: error?.details,
    });
  }
  return json as T;
}
