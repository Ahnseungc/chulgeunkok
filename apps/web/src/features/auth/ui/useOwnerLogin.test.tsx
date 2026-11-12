/**
 * @vitest-environment jsdom
 */
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useOwnerLogin } from './useOwnerLogin';

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
const notifyDeviceRegistered = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('@/shared/lib/app-shell', () => ({ notifyDeviceRegistered }));

const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ needsName: false }) }));

describe('useOwnerLogin — 번호 붙이기 (auth §4.2)', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    router.replace.mockReset();
    notifyDeviceRegistered.mockClear();
  });

  it('attach 로 확인하고 앱에 기기 등록을 알리지 않은 채 돌아갈 화면으로 간다', async () => {
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useOwnerLogin({ attach: true, nextPath: '/owner/s1/payroll' }));
    await act(() => result.current.verifyCode('010-1234-5678', '123456'));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/auth/otp/verify',
      expect.objectContaining({ body: JSON.stringify({ phone: '010-1234-5678', code: '123456', attach: true }) }),
    );
    expect(notifyDeviceRegistered).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith('/owner/s1/payroll');
  });

  it('일반 로그인은 앱에 알리고 /owner 로 간다', async () => {
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useOwnerLogin({ attach: false, nextPath: '/owner' }));
    await act(() => result.current.verifyCode('010-1234-5678', '123456'));
    expect([notifyDeviceRegistered.mock.calls.length, router.replace.mock.calls[0]?.[0]]).toEqual([1, '/owner']);
  });
});
