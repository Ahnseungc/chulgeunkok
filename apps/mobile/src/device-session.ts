import * as SecureStore from 'expo-secure-store';

import { WEB_ORIGIN } from './config';

/**
 * 앱 전용 기기 토큰. Keychain·Keystore(SecureStore)에만 둔다 (docs/specs/auth §6.2).
 * 웹뷰 쿠키를 직접 읽지 않고, 1회용 교환 코드로 토큰을 주고받는다 — 토큰이 JS에 노출되지 않는다.
 */
const TOKEN_KEY = 'chulgeunkok.deviceToken';

interface HandoffResponse {
  code: string;
}

/** 웹이 등록 직후 넘긴 교환 코드 → 앱 기기 토큰 저장 */
export async function saveDeviceFromHandoff(handoffCode: string): Promise<boolean> {
  try {
    const response = await fetch(`${WEB_ORIGIN}/api/v1/auth/handoff/redeem`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: handoffCode }),
    });
    if (!response.ok) return false;
    const { deviceToken } = (await response.json()) as { deviceToken: string };
    await SecureStore.setItemAsync(TOKEN_KEY, deviceToken);
    return true;
  } catch (error) {
    console.warn('[device] 기기 토큰 저장 실패', error);
    return false;
  }
}

/**
 * 웹뷰를 열 주소. 저장된 토큰이 있으면 교환 코드를 받아 `/auth/restore`로 열어 웹뷰에 쿠키를 심는다.
 * 토큰이 폐기됐으면(기기 재등록·퇴사) 지우고 그냥 연다 — 웹 화면이 미등록 안내를 보여 준다.
 */
export async function buildEntryUrl(nextPath: string): Promise<string> {
  const plainUrl = `${WEB_ORIGIN}${nextPath}`;
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  if (!token) return plainUrl;
  try {
    const response = await fetch(`${WEB_ORIGIN}/api/v1/auth/handoff`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: '{}',
    });
    if (response.status === 401) {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
      return plainUrl;
    }
    if (!response.ok) return plainUrl;
    const { code } = (await response.json()) as HandoffResponse;
    return `${WEB_ORIGIN}/auth/restore?${new URLSearchParams({ code, next: nextPath })}`;
  } catch (error) {
    // 오프라인 등: 웹뷰에 남아 있는 쿠키로 열어 본다
    console.warn('[device] 세션 복원 실패', error);
    return plainUrl;
  }
}
