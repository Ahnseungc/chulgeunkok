import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { ApiError } from '@/server/http/api-error';
import { assertDevFallbackAllowed } from '@/server/integrations/dev-fallback';

/**
 * 매장 QR 원문 암호화 — docs/specs/qr-card §3.1
 * 형식 `v1.<iv base64url>.<ciphertext+tag base64url>`, AES-256-GCM.
 * `v1`은 키 버전이다. 키를 바꿀 때 `v2`를 추가하고 둘 다 읽는다.
 */
const ALGORITHM = 'aes-256-gcm';
const KEY_VERSION = 'v1';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
/** 개발 전용 고정 키. production에서는 쓰지 않는다 (assertDevFallbackAllowed) */
const DEV_FALLBACK_KEY = Buffer.from('chulgeunkok-dev-qr-token-key-32b', 'utf8');

function resolveKey(): Buffer {
  const encoded = process.env.QR_TOKEN_ENC_KEY;
  if (!encoded) {
    assertDevFallbackAllowed('QR_TOKEN_ENC_KEY');
    return DEV_FALLBACK_KEY;
  }
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== KEY_BYTES) {
    // 키 값은 절대 로그에 남기지 않는다
    console.error('[qr] QR_TOKEN_ENC_KEY 길이가 32바이트가 아니에요');
    throw new ApiError('INTERNAL');
  }
  return key;
}

export function encryptQrToken(rawToken: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, resolveKey(), iv);
  const body = Buffer.concat([cipher.update(rawToken, 'utf8'), cipher.final(), cipher.getAuthTag()]);
  return [KEY_VERSION, iv.toString('base64url'), body.toString('base64url')].join('.');
}

/** 형식이 틀리거나 인증 태그가 맞지 않으면 throw */
export function decryptQrToken(ciphertext: string): string {
  const [version, ivPart, bodyPart, ...rest] = ciphertext.split('.');
  if (version !== KEY_VERSION || !ivPart || !bodyPart || rest.length > 0) {
    throw new Error('QR 암호문 형식이 올바르지 않아요');
  }
  const iv = Buffer.from(ivPart, 'base64url');
  const body = Buffer.from(bodyPart, 'base64url');
  if (iv.length !== IV_BYTES || body.length <= AUTH_TAG_BYTES) {
    throw new Error('QR 암호문 길이가 올바르지 않아요');
  }
  const decipher = createDecipheriv(ALGORITHM, resolveKey(), iv);
  decipher.setAuthTag(body.subarray(-AUTH_TAG_BYTES));
  return Buffer.concat([decipher.update(body.subarray(0, -AUTH_TAG_BYTES)), decipher.final()]).toString('utf8');
}
