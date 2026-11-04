import type { PrismaClient } from '@chulgeunkok/db';

import { generateToken } from '@/server/crypto/generate-token';
import { hashToken } from '@/server/crypto/hash-token';
import { ApiError } from '@/server/http/api-error';

import { registerDevice } from './device';

/** 교환 코드 유효 시간. 화면 전환 사이에만 쓰므로 짧게 (docs/specs/auth §6.2) */
export const HANDOFF_TTL_MS = 60 * 1000;

/** 웹 화면이 열려 있는 경로만 복원 후 돌아갈 수 있다 (오픈 리다이렉트 방지) */
const RESTORE_NEXT_PATTERN = /^\/(me|owner|p|invite)(\/[A-Za-z0-9_\-/]*)?$/;
const DEFAULT_RESTORE_PATH = '/me';

/**
 * 로그인된 기기(웹뷰 쿠키 또는 앱 Bearer)에서 같은 사람의 새 기기 토큰을 한 번 발급받을 코드.
 * 앱 ↔ 웹뷰가 서로의 저장소를 읽지 않고 세션을 나눠 가지는 유일한 통로다.
 */
export async function createHandoffCode(
  db: PrismaClient,
  input: { userId: string; now: Date },
): Promise<{ code: string; expiresAt: string }> {
  const code = generateToken();
  const expiresAt = new Date(input.now.getTime() + HANDOFF_TTL_MS);
  await db.deviceHandoffCode.create({ data: { userId: input.userId, codeHash: hashToken(code), expiresAt } });
  return { code, expiresAt: expiresAt.toISOString() };
}

/** 코드 → 새 기기 토큰. 한 번 쓰면 끝, 만료·없음은 모두 HANDOFF_INVALID */
export async function redeemHandoffCode(
  db: PrismaClient,
  input: { code: string; userAgent: string | null; now: Date },
): Promise<{ userId: string; deviceToken: string }> {
  return db.$transaction(async (tx) => {
    const handoff = await tx.deviceHandoffCode.findUnique({ where: { codeHash: hashToken(input.code) } });
    if (!handoff) throw new ApiError('HANDOFF_INVALID');
    const claimed = await tx.deviceHandoffCode.updateMany({
      where: { id: handoff.id, usedAt: null, expiresAt: { gt: input.now } },
      data: { usedAt: input.now },
    });
    if (claimed.count === 0) throw new ApiError('HANDOFF_INVALID');
    const deviceToken = await registerDevice(tx, { userId: handoff.userId, userAgent: input.userAgent });
    return { userId: handoff.userId, deviceToken };
  });
}

export function safeRestorePath(next: string | null): string {
  return next && RESTORE_NEXT_PATTERN.test(next) && !next.includes('//') ? next : DEFAULT_RESTORE_PATH;
}
