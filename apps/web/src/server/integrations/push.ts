import type { Messaging } from 'firebase-admin/messaging';

import { ApiError } from '@/server/http/api-error';

import { assertDevFallbackAllowed } from './dev-fallback';

/** 푸시 알림 한 건. `path`는 앱이 알림을 탭했을 때 WebView로 여는 경로 (docs/specs/payslip §6) */
export interface PushMessage {
  title: string;
  body: string;
  path: string;
}

/** 기기 토큰 한 개로 보낸다. 지워야 할 토큰이면 `TOKEN_INVALID`, 그 밖의 실패는 throw */
export interface PushSender {
  send(token: string, message: PushMessage): Promise<'SENT' | 'TOKEN_INVALID'>;
}

/** FCM이 "이 토큰은 더 못 쓴다"고 답하는 에러 코드 (§6) */
const INVALID_TOKEN_CODES = new Set(['messaging/registration-token-not-registered', 'messaging/invalid-registration-token']);

/** dev 로그에 남기는 토큰 뒤 글자 수 */
const TOKEN_LOG_TAIL = 6;

const devPushSender: PushSender = {
  async send(token, message) {
    assertDevFallbackAllowed('PUSH_PROVIDER');
    // 토큰 원문은 로그에 남기지 않는다. 기기 구분용 뒤 6자리만
    console.info(`[push:dev] …${token.slice(-TOKEN_LOG_TAIL)} ← ${message.title} / ${message.body} (${message.path})`);
    return 'SENT';
  },
};

const isInvalidTokenError = (error: unknown) =>
  typeof error === 'object' && error !== null && 'code' in error && INVALID_TOKEN_CODES.has(String(error.code));

/** 서비스 계정으로 firebase-admin을 처음 쓸 때 초기화한다. 테스트 경로가 SDK를 불러오지 않게 동적 import */
async function loadMessaging(): Promise<Messaging> {
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccount) {
    console.error('[integrations] FIREBASE_SERVICE_ACCOUNT 설정이 없어요');
    throw new ApiError('INTERNAL');
  }
  const { cert, getApps, initializeApp } = await import('firebase-admin/app');
  const { getMessaging } = await import('firebase-admin/messaging');
  const app = getApps()[0] ?? initializeApp({ credential: cert(JSON.parse(serviceAccount)) });
  return getMessaging(app);
}

function createFcmSender(): PushSender {
  let messaging: Promise<Messaging> | null = null;
  const ready = () => {
    // 초기화 실패는 캐시하지 않고 다음 호출에서 다시 시도한다
    messaging ??= loadMessaging().catch((error: unknown) => {
      messaging = null;
      throw error;
    });
    return messaging;
  };
  return {
    async send(token, { title, body, path }) {
      const client = await ready();
      try {
        await client.send({ token, notification: { title, body }, data: { path } });
        return 'SENT';
      } catch (error) {
        if (isInvalidTokenError(error)) return 'TOKEN_INVALID';
        throw error;
      }
    },
  };
}

let fcmSender: PushSender | null = null;

/** `PUSH_PROVIDER=fcm` 이면 firebase-admin, 아니면 dev 발송기 (production에서는 오류) */
export function getPushSender(): PushSender {
  if (process.env.PUSH_PROVIDER !== 'fcm') return devPushSender;
  fcmSender ??= createFcmSender();
  return fcmSender;
}
