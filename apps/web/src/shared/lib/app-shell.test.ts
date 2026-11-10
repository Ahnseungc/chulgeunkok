/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppLocationError, requestAppLocation } from './app-shell';

const TIMEOUT_MS = 1000;
const COORDS = { latitude: 37.5, longitude: 127.03, accuracy: 12.4 };

/** 앱이 마지막으로 받은 REQUEST_LOCATION 의 requestId */
function lastRequestId(postMessage: ReturnType<typeof vi.fn>): string {
  const raw = postMessage.mock.calls.at(-1)?.[0] as string;
  return (JSON.parse(raw) as { requestId: string }).requestId;
}

/** react-native-webview 처럼 앱 → 웹 메시지를 문자열로 보낸다 (iOS: window, Android: document) */
function replyFromApp(target: Window | Document, message: unknown) {
  target.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(message) }));
}

describe('requestAppLocation', () => {
  const postMessage = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    window.ReactNativeWebView = { postMessage };
  });

  afterEach(() => {
    vi.useRealTimers();
    postMessage.mockReset();
    delete window.ReactNativeWebView;
  });

  it('REQUEST_LOCATION 을 보내고 같은 requestId 의 좌표로 끝난다 (window)', async () => {
    const pending = requestAppLocation(TIMEOUT_MS);
    const requestId = lastRequestId(postMessage);
    expect(JSON.parse(postMessage.mock.calls[0]?.[0] as string)).toEqual({ type: 'REQUEST_LOCATION', requestId });

    replyFromApp(window, { type: 'LOCATION', requestId: 'other-request-id', error: 'DENIED' });
    replyFromApp(window, { type: 'LOCATION', requestId, coords: COORDS });
    await expect(pending).resolves.toEqual(COORDS);
  });

  it('Android 처럼 document 로 온 응답도 받는다', async () => {
    const pending = requestAppLocation(TIMEOUT_MS);
    replyFromApp(document, { type: 'LOCATION', requestId: lastRequestId(postMessage), coords: COORDS });
    await expect(pending).resolves.toEqual(COORDS);
  });

  it('앱이 거부를 알리면 DENIED 로 실패한다', async () => {
    const pending = requestAppLocation(TIMEOUT_MS);
    replyFromApp(window, { type: 'LOCATION', requestId: lastRequestId(postMessage), error: 'DENIED' });
    await expect(pending).rejects.toMatchObject({ reason: 'DENIED' });
  });

  it('응답이 없으면 TIMEOUT 으로 실패한다', async () => {
    const pending = requestAppLocation(TIMEOUT_MS);
    vi.advanceTimersByTime(TIMEOUT_MS);
    await expect(pending).rejects.toMatchObject({ reason: 'TIMEOUT' });
  });

  it('앱 밖이면 요청 없이 UNAVAILABLE 로 실패한다', async () => {
    delete window.ReactNativeWebView;
    await expect(requestAppLocation(TIMEOUT_MS)).rejects.toBeInstanceOf(AppLocationError);
    expect(postMessage).not.toHaveBeenCalled();
  });
});
