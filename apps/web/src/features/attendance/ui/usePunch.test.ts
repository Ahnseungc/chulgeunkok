/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { requestLocation } from './usePunch';

const COORDS = { latitude: 37.5, longitude: 127.03, accuracy: 12.4 };
const EXPECTED = { latitude: 37.5, longitude: 127.03, accuracyM: 12 };

describe('requestLocation', () => {
  afterEach(() => {
    delete window.ReactNativeWebView;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('앱 안이면 navigator.geolocation 을 부르지 않고 앱 좌표를 쓴다', async () => {
    const getCurrentPosition = vi.fn();
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });
    window.ReactNativeWebView = {
      postMessage: (raw) => {
        const { requestId } = JSON.parse(raw) as { requestId: string };
        queueMicrotask(() =>
          window.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ type: 'LOCATION', requestId, coords: COORDS }) })),
        );
      },
    };
    const onLocation = vi.fn();

    requestLocation(onLocation);

    await vi.waitFor(() => expect(onLocation).toHaveBeenCalledWith(EXPECTED));
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it('앱 안에서 위치를 거부하면 위치 없이 진행한다 (콜백 없음)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    window.ReactNativeWebView = {
      postMessage: (raw) => {
        const { requestId } = JSON.parse(raw) as { requestId: string };
        queueMicrotask(() =>
          window.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ type: 'LOCATION', requestId, error: 'DENIED' }) })),
        );
      },
    };
    const onLocation = vi.fn();

    requestLocation(onLocation);

    await vi.waitFor(() => expect(console.warn).toHaveBeenCalled());
    expect(onLocation).not.toHaveBeenCalled();
  });

  it('브라우저면 navigator.geolocation 을 쓴다', () => {
    const getCurrentPosition = vi.fn((onSuccess: PositionCallback) => onSuccess({ coords: COORDS } as GeolocationPosition));
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });
    const onLocation = vi.fn();

    requestLocation(onLocation);

    expect(onLocation).toHaveBeenCalledWith(EXPECTED);
  });
});
