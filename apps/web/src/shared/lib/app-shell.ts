'use client';

import { parseAppToWeb, type WebToAppMessage } from '@chulgeunkok/app-bridge';
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

/**
 * iOS 앱 안인지. 앱 WebView 는 엣지 스와이프 back(allowsBackForwardNavigationGestures)을 네이티브가 슬라이드해 준다.
 * 마운트 뒤에 판단한다 (useIsInApp 과 같은 이유)
 */
export function useIsIosApp(): boolean {
  const [iosApp, setIosApp] = useState(false);
  useEffect(() => {
    setIosApp(Boolean(window.ReactNativeWebView) && /iPhone|iPad|iPod/.test(navigator.userAgent));
  }, []);
  return iosApp;
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

export type AppLocationCoords = { latitude: number; longitude: number; accuracy: number };

/** 앱에서 위치를 받지 못한 이유. TIMEOUT 은 앱이 제때 답하지 않은 경우 (구버전 앱 포함) */
export class AppLocationError extends Error {
  constructor(readonly reason: 'DENIED' | 'UNAVAILABLE' | 'TIMEOUT') {
    super(`[app-shell] 앱 위치 실패: ${reason}`);
    this.name = 'AppLocationError';
  }
}

/**
 * 앱(네이티브)에 위치를 요청한다. 앱 안에서 WebView geolocation 을 쓰면 iOS 가 앱 권한 뒤에 사이트 권한을 또 묻기 때문.
 * 응답은 react-native-webview 의 postMessage — iOS 는 window, Android 는 document 에 message 이벤트로 온다.
 * 앱 밖이면 바로 UNAVAILABLE 로 실패한다 (그때는 navigator.geolocation 을 쓴다).
 */
export function requestAppLocation(timeoutMs: number): Promise<AppLocationCoords> {
  if (!window.ReactNativeWebView) return Promise.reject(new AppLocationError('UNAVAILABLE'));
  // 짝짓기용일 뿐이라 보안 난수가 필요 없다 (crypto.randomUUID 는 http LAN 주소에서 없다)
  const requestId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      window.removeEventListener('message', handleMessage);
      document.removeEventListener('message', handleMessage);
    };
    const handleMessage = (event: Event) => {
      const message = parseAppToWeb((event as MessageEvent).data);
      if (message?.type !== 'LOCATION' || message.requestId !== requestId) return;
      cleanup();
      if ('coords' in message) resolve(message.coords);
      else reject(new AppLocationError(message.error));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new AppLocationError('TIMEOUT'));
    }, timeoutMs);
    window.addEventListener('message', handleMessage);
    document.addEventListener('message', handleMessage);
    postToApp({ type: 'REQUEST_LOCATION', requestId });
  });
}
