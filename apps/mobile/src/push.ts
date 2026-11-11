import { Alert, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import { WEB_ORIGIN } from './config';
import { getDeviceToken } from './device-session';

const ASKED_KEY = 'chulgeunkok.pushAsked';

type MessagingModule = typeof import('@react-native-firebase/messaging');
type MessagingInstance = ReturnType<MessagingModule['getMessaging']>;
type PushMessage = { data?: Record<string, unknown> } | null;

interface Push {
  module: MessagingModule;
  messaging: MessagingInstance;
}

let cachedPush: Push | null | undefined;

/**
 * Firebase 네이티브 모듈이 없으면(Expo Go, 설정 파일 없는 빌드) null — 푸시만 꺼지고 앱은 그대로 동작한다.
 * 모듈 로드·초기화는 함수 안에서 지연해 실패해도 앱 시작을 막지 않는다.
 */
function loadPush(): Push | null {
  if (cachedPush !== undefined) return cachedPush;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const module = require('@react-native-firebase/messaging') as MessagingModule;
    cachedPush = { module, messaging: module.getMessaging() }; // 네이티브 모듈 미존재면 여기서 던진다
  } catch (error) {
    console.warn('[push] Firebase 메시징을 쓸 수 없어 푸시를 건너뜁니다', error);
    cachedPush = null;
  }
  return cachedPush;
}

const confirmPushAlert = (): Promise<boolean> =>
  new Promise((resolve) => {
    Alert.alert(
      '알림을 켜 주세요',
      '임금명세서가 도착하면 알려 드릴게요.',
      [
        { text: '나중에', style: 'cancel', onPress: () => resolve(false) },
        { text: '알림 켜기', onPress: () => resolve(true) },
      ],
      { cancelable: false },
    );
  });

/** 처음 한 번만 안내 후 OS 알림 권한을 요청한다 */
export async function askPushPermissionOnce(): Promise<void> {
  const push = loadPush();
  if (!push) return;
  try {
    if (await SecureStore.getItemAsync(ASKED_KEY)) return;
    await SecureStore.setItemAsync(ASKED_KEY, '1');
    if (await confirmPushAlert()) await push.module.requestPermission(push.messaging);
  } catch (error) {
    console.warn('[push] 알림 권한 요청 실패', error);
  }
}

/** FCM 토큰을 서버에 등록한다. 기기 토큰이 없으면(미등록 기기) 건너뛴다 */
export async function syncPushToken(): Promise<void> {
  const push = loadPush();
  if (!push) return;
  try {
    const deviceToken = await getDeviceToken();
    if (!deviceToken) return;
    const token = await push.module.getToken(push.messaging);
    const response = await fetch(`${WEB_ORIGIN}/api/v1/push-tokens`, {
      method: 'POST',
      headers: { authorization: `Bearer ${deviceToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ token, platform: Platform.OS === 'ios' ? 'ios' : 'android' }),
    });
    if (!response.ok) console.warn('[push] 토큰 등록 거절', response.status);
  } catch (error) {
    console.warn('[push] 토큰 등록 실패', error);
  }
}

/** FCM 토큰이 바뀔 때마다 `onRefresh` 호출. 해제 함수 반환 */
export function onPushTokenRefresh(onRefresh: () => void): () => void {
  const push = loadPush();
  if (!push) return () => undefined;
  return push.module.onTokenRefresh(push.messaging, onRefresh);
}

const pathOf = (message: PushMessage): string | null => {
  const path = message?.data?.path;
  return typeof path === 'string' && path.startsWith('/') ? path : null;
};

/** 알림을 눌러 앱이 열리면 data.path 로 이동 (종료 상태에서 열린 경우 포함). 해제 함수 반환 */
export function onPushOpen(open: (path: string) => void): () => void {
  const push = loadPush();
  if (!push) return () => undefined;
  const openIfPath = (message: PushMessage) => {
    const path = pathOf(message);
    if (path) open(path);
  };
  push.module
    .getInitialNotification(push.messaging)
    .then(openIfPath)
    .catch((error: unknown) => console.warn('[push] 초기 알림 확인 실패', error));
  return push.module.onNotificationOpenedApp(push.messaging, openIfPath);
}
