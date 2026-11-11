import { Alert, PermissionsAndroid, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import { toPushPath } from '@chulgeunkok/app-bridge';

import { WEB_ORIGIN } from './config';
import { getDeviceToken } from './device-session';

const ASKED_KEY = 'chulgeunkok.pushAsked';
/** POST_NOTIFICATIONS 런타임 권한이 생긴 Android API (13) */
const ANDROID_NOTIFICATION_PERMISSION_API = 33;

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

/** Android 13+ 는 RN Firebase 가 권한을 묻지 않아 직접 요청한다 (iOS·그 이하는 requestPermission) */
async function requestOsPermission(push: Push): Promise<void> {
  if (Platform.OS === 'android' && Platform.Version >= ANDROID_NOTIFICATION_PERMISSION_API) {
    await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    return;
  }
  await push.module.requestPermission(push.messaging);
}

/** 처음 한 번만 안내 후 OS 알림 권한을 요청한다 */
export async function askPushPermissionOnce(): Promise<void> {
  const push = loadPush();
  if (!push) return;
  try {
    if (await SecureStore.getItemAsync(ASKED_KEY)) return;
    const accepted = await confirmPushAlert();
    await SecureStore.setItemAsync(ASKED_KEY, '1'); // 안내에 답한 뒤에만 기록 (앱이 먼저 꺼지면 다음에 다시 묻는다)
    if (accepted) await requestOsPermission(push);
  } catch (error) {
    console.warn('[push] 알림 권한 요청 실패', error);
  }
}

/** OS 알림이 허용됐는지. 거절·아직 안 물음이면 false (알림이 화면에 뜨지 않는다) */
async function notificationsAllowed(push: Push): Promise<boolean> {
  const { AuthorizationStatus } = push.module;
  const status = await push.module.hasPermission(push.messaging);
  return status !== AuthorizationStatus.DENIED && status !== AuthorizationStatus.NOT_DETERMINED;
}

/**
 * FCM 토큰을 서버에 등록한다. 기기 토큰이 없거나(미등록 기기) OS 알림을 거절했으면 건너뛴다 —
 * 등록하지 않아야 사장님 목록에 "알림 미수신"이 보인다 (docs/specs/payslip §5.1·§6)
 */
export async function syncPushToken(): Promise<void> {
  const push = loadPush();
  if (!push) return;
  try {
    const deviceToken = await getDeviceToken();
    if (!deviceToken || !(await notificationsAllowed(push))) return;
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

const pathOf = (message: PushMessage): string | null => toPushPath(message?.data?.path);

/** 종료 상태에서 알림을 눌러 앱이 열렸으면 그 알림의 data.path. 없거나 확인 실패면 null */
export async function initialPushPath(): Promise<string | null> {
  const push = loadPush();
  if (!push) return null;
  try {
    return pathOf(await push.module.getInitialNotification(push.messaging));
  } catch (error) {
    console.warn('[push] 초기 알림 확인 실패', error);
    return null;
  }
}

/** 백그라운드에서 알림을 눌러 앱으로 돌아오면 data.path 로 이동. 종료 상태는 initialPushPath. 해제 함수 반환 */
export function onPushOpen(open: (path: string) => void): () => void {
  const push = loadPush();
  if (!push) return () => undefined;
  return push.module.onNotificationOpenedApp(push.messaging, (message: PushMessage) => {
    const path = pathOf(message);
    if (path) open(path);
  });
}
