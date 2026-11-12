import type { Prisma, PrismaClient, StoreQrToken } from '@chulgeunkok/db';

import { requireMembership } from '@/server/auth/require-membership';
import { generateToken } from '@/server/crypto/generate-token';
import { hashToken } from '@/server/crypto/hash-token';
import { decryptQrToken, encryptQrToken } from '@/server/crypto/qr-token-cipher';
import { ApiError } from '@/server/http/api-error';

/**
 * 매장 QR 토큰 발급. 원문으로 tokenHash(출퇴근 판정)와 tokenCiphertext(재조회)를 같이 쓴다.
 * 원문을 돌려준다 (docs/specs/qr-card §3.1, store §5.1)
 */
export async function issueQrToken(tx: Prisma.TransactionClient, storeId: string): Promise<string> {
  const rawToken = generateToken();
  await tx.storeQrToken.create({
    data: { storeId, tokenHash: hashToken(rawToken), tokenCiphertext: encryptQrToken(rawToken) },
  });
  return rawToken;
}

/**
 * GET /stores/:storeId/qr — Owner만 (docs/specs/qr-card §3.2).
 * 암호문이 없는 이전 토큰, 풀리지 않거나 이 행의 tokenHash와 맞지 않는 암호문은 url null (재발급 안내).
 */
export async function getStoreQrUrl(
  db: PrismaClient,
  input: { storeId: string; actorUserId: string; origin: string },
): Promise<{ url: string | null; issuedAt: string | null }> {
  await requireMembership({ storeId: input.storeId, userId: input.actorUserId, action: 'STORE_ADMIN' }, db);
  const token = await db.storeQrToken.findFirst({ where: { storeId: input.storeId, revokedAt: null } });
  const issuedAt = token?.createdAt.toISOString() ?? null;
  const rawToken = token ? rawTokenOf(token, input.storeId) : null;
  return { url: rawToken ? `${input.origin}/p/${rawToken}` : null, issuedAt };
}

/** 암호문을 다른 행에서 옮겨 와도 쓰지 않도록, 푼 원문이 이 행의 tokenHash와 같을 때만 돌려준다 (§3.1) */
function rawTokenOf(token: Pick<StoreQrToken, 'tokenHash' | 'tokenCiphertext'>, storeId: string): string | null {
  if (!token.tokenCiphertext) return null;
  const rawToken = decryptOrNull(token.tokenCiphertext, storeId);
  if (rawToken === null) return null;
  if (hashToken(rawToken) === token.tokenHash) return rawToken;
  // 복구 가능: 재발급하면 맞는 암호문이 생긴다. 원문은 남기지 않는다
  console.error('[qr] 암호문과 토큰이 맞지 않음', storeId);
  return null;
}

function decryptOrNull(ciphertext: string, storeId: string): string | null {
  try {
    return decryptQrToken(ciphertext);
  } catch (error) {
    // 키 설정 오류(production 키 없음)는 재발급으로 못 고치므로 그대로 올린다
    if (error instanceof ApiError) throw error;
    // 복구 가능: 재발급으로 새 암호문을 만든다. 원문·키는 남기지 않는다
    console.error('[qr] 암호문 복호화 실패', storeId);
    return null;
  }
}
