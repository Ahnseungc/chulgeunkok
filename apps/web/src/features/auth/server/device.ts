import { DEVICE_COOKIE } from '@chulgeunkok/app-bridge';
import type { DbClient } from '@chulgeunkok/db';
import type { NextResponse } from 'next/server';

import { generateToken } from '@/server/crypto/generate-token';
import { hashToken } from '@/server/crypto/hash-token';

/** 기기 쿠키 이름은 앱 셸과 같은 정본을 쓴다 (docs/specs/auth §3.2) */
export { DEVICE_COOKIE };
const DEVICE_COOKIE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60; // 브라우저 상한

/** 기기를 등록하고 쿠키에 넣을 토큰 원문을 돌려준다. 원문은 DB에 남지 않는다 */
export async function registerDevice(
  db: DbClient,
  input: { userId: string; userAgent: string | null },
): Promise<string> {
  const token = generateToken();
  await db.deviceCredential.create({
    data: { userId: input.userId, tokenHash: hashToken(token), userAgent: input.userAgent },
  });
  return token;
}

/** 그 사람의 기기 전부 폐기. 기기 재등록 시 (docs/specs/auth §3.4) */
export async function revokeUserDevices(db: DbClient, input: { userId: string; now: Date }) {
  await db.deviceCredential.updateMany({
    where: { userId: input.userId, revokedAt: null },
    data: { revokedAt: input.now },
  });
}

/** 쿠키 토큰 → userId. 없거나 폐기됐으면 null */
export async function findDeviceUserId(db: DbClient, token: string): Promise<string | null> {
  const device = await db.deviceCredential.findUnique({ where: { tokenHash: hashToken(token) } });
  return device && !device.revokedAt ? device.userId : null;
}

export function setDeviceCookie(response: NextResponse, token: string): void {
  response.cookies.set(DEVICE_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    // QR·NFC로 열리는 첫 요청에도 실려야 한다
    sameSite: 'lax',
    maxAge: DEVICE_COOKIE_MAX_AGE_SECONDS,
    path: '/',
  });
}

/** 로그아웃: 이 기기 하나만 폐기 */
export async function revokeDeviceToken(db: DbClient, input: { token: string; now: Date }) {
  await db.deviceCredential.updateMany({
    where: { tokenHash: hashToken(input.token), revokedAt: null },
    data: { revokedAt: input.now },
  });
}

export function clearDeviceCookie(response: NextResponse): void {
  response.cookies.set(DEVICE_COOKIE, '', { httpOnly: true, maxAge: 0, path: '/' });
}
