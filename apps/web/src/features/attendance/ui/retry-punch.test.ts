import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiRequestError } from '@/shared/lib/api-client';

import { retryPunch } from './retry-punch';

const networkError = () => new TypeError('Failed to fetch');
const conflict = () => new ApiRequestError({ code: 'PUNCH_TOO_SOON', message: '', status: 409 });

describe('retryPunch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('네트워크 실패 후 성공하면 결과를 돌려준다', async () => {
    const send = vi.fn().mockRejectedValueOnce(networkError()).mockResolvedValueOnce('ok');
    const result = retryPunch(send);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await result).toBe('ok');
  });

  it('4xx는 재시도하지 않는다', async () => {
    const send = vi.fn().mockRejectedValue(conflict());
    await expect(retryPunch(send)).rejects.toMatchObject({ code: 'PUNCH_TOO_SOON' });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('최대 3번 재시도한 뒤 마지막 오류를 던진다', async () => {
    const send = vi.fn().mockRejectedValue(networkError());
    const result = retryPunch(send).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(1000 + 2000 + 4000);
    expect(await result).toBeInstanceOf(TypeError);
    expect(send).toHaveBeenCalledTimes(4);
  });
});
