import * as Location from 'expo-location';

import type { AppToWebMessage } from '@chulgeunkok/app-bridge';

/** 웹 navigator.geolocation 의 maximumAge 와 같은 기준 (apps/web usePunch) */
const LAST_KNOWN_MAX_AGE_MS = 60_000;

type LocationReply = Extract<AppToWebMessage, { type: 'LOCATION' }>;

/**
 * 출퇴근 위치를 네이티브로 받는다. 권한은 OS 가 앱 단위로 한 번만 묻는다
 * (WebView geolocation 을 쓰면 iOS 가 사이트 단위로 한 번 더 묻는다).
 * 실패는 throw 하지 않고 사유로 돌려준다 — 위치 없이도 출퇴근은 진행된다 (docs/specs/attendance §3.1)
 */
export async function getNativeLocation(requestId: string): Promise<LocationReply> {
  try {
    const { granted } = await Location.requestForegroundPermissionsAsync();
    if (!granted) return { type: 'LOCATION', requestId, error: 'DENIED' };
    const position =
      (await Location.getLastKnownPositionAsync({ maxAge: LAST_KNOWN_MAX_AGE_MS })) ??
      (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
    const { latitude, longitude, accuracy } = position.coords;
    return { type: 'LOCATION', requestId, coords: { latitude, longitude, accuracy: accuracy ?? 0 } };
  } catch (error) {
    // 위치 서비스 꺼짐·측위 실패. 웹은 위치 없이 진행한다
    console.warn('[native-location] 위치를 받지 못함', error);
    return { type: 'LOCATION', requestId, error: 'UNAVAILABLE' };
  }
}
