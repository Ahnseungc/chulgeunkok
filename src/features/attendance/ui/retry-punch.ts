import { delay } from 'es-toolkit';

import { ApiRequestError } from '@/shared/lib/api-client';

/** 응답을 못 받았을 때 같은 Idempotency-Key로 다시 보내는 간격. docs/specs/attendance §3.5 */
export const PUNCH_RETRY_DELAYS_MS = [1000, 2000, 4000] as const;

/** 네트워크 실패와 5xx만 재시도한다. 4xx는 사용자에게 바로 보여 줄 실패다 */
export function isRetryablePunchError(error: unknown): boolean {
  if (error instanceof ApiRequestError) return error.status >= 500;
  return error instanceof TypeError;
}

export async function retryPunch<T>(send: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await send();
    } catch (error) {
      const waitMs = PUNCH_RETRY_DELAYS_MS[attempt];
      if (waitMs === undefined || !isRetryablePunchError(error)) throw error;
      await delay(waitMs);
    }
  }
}
