import type { DbClient } from '@chulgeunkok/db';

import type { PushMessage, PushSender } from './push';

/** 한 토큰 발송. 예외는 로그로 바꾼다 */
async function sendSafely(input: { push: PushSender; token: string; message: PushMessage; logTag: string }) {
  try {
    return await input.push.send(input.token, input.message);
  } catch (error) {
    console.error(`[${input.logTag}] 푸시 발송 실패`, input.message.path, error);
    return null;
  }
}

/**
 * 한 사용자의 기기들에 같은 알림을 보낸다. 더 못 쓰는 토큰은 지운다 (docs/specs/payslip §6).
 * 발송 실패는 로그만 남기고 던지지 않는다. 토큰 삭제 실패는 호출한 쪽이 잡는다
 */
export async function notifyDevices(
  db: DbClient,
  input: { push: PushSender; tokens: readonly string[]; message: PushMessage; logTag: string },
): Promise<void> {
  for (const token of input.tokens) {
    const result = await sendSafely({ ...input, token });
    if (result === 'TOKEN_INVALID') await db.pushToken.deleteMany({ where: { token } });
  }
}
