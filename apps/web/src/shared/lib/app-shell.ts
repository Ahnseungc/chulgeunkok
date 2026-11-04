'use client';

import type { WebToAppMessage } from '@chulgeunkok/app-bridge';
import { useEffect, useState } from 'react';

import { apiFetch } from './api-client';

declare global {
  interface Window {
    /** react-native-webview가 주입한다. 일반 브라우저에는 없다 */
    ReactNativeWebView?: { postMessage: (message: string) => void };
  }
}

/** 출근콕 앱(RN WebView) 안에서 열렸는지. SSR과 맞추려고 마운트 뒤에 판단한다 */
export function useIsInApp(): boolean {
  const [inApp, setInApp] = useState(false);
  useEffect(() => setInApp(Boolean(window.ReactNativeWebView)), []);
  return inApp;
}

export function postToApp(message: WebToAppMessage): void {
  window.ReactNativeWebView?.postMessage(JSON.stringify(message));
}

/**
 * 이 기기 등록이 끝났음을 앱에 알린다. 1회용 교환 코드만 넘기고 토큰은 넘기지 않는다 (docs/specs/auth §6.2).
 * 앱 밖이면 아무것도 하지 않는다. 실패해도 웹 쿠키 세션은 살아 있으니 화면 흐름은 막지 않는다.
 */
export async function notifyDeviceRegistered(): Promise<void> {
  if (!window.ReactNativeWebView) return;
  try {
    const { code } = await apiFetch<{ code: string }>('/api/v1/auth/handoff', { method: 'POST', body: '{}' });
    postToApp({ type: 'DEVICE_REGISTERED', handoffCode: code });
  } catch (error) {
    console.warn('[app-shell] 앱 기기 등록 알림 실패', error);
  }
}
