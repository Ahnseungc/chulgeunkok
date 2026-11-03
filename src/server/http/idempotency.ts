import { createHash } from 'node:crypto';

import type { Prisma } from '@prisma/client';

import { ApiError } from './api-error';

/** 같은 키 재시도에 같은 응답을 주는 기간. docs/specs/attendance §3.3 */
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

interface IdempotencyScope {
  userId: string;
  key: string;
  requestHash: string;
  now: Date;
}

export function hashRequest(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

/**
 * 저장된 성공 응답이 있으면 돌려준다. 호출부가 같은 사용자 행을 잠근 트랜잭션 안에서 불러야
 * 동시 재시도가 직렬화된다.
 * - 만료된 키는 지우고 새 요청으로 처리
 * - 같은 키에 다른 요청 → IDEMPOTENCY_KEY_REUSED
 */
export async function findIdempotentReplay<TResponse>(
  tx: Prisma.TransactionClient,
  scope: IdempotencyScope,
): Promise<TResponse | null> {
  const where = { userId_key: { userId: scope.userId, key: scope.key } };
  const saved = await tx.idempotencyKey.findUnique({ where });
  if (!saved) return null;
  if (saved.expiresAt <= scope.now) {
    await tx.idempotencyKey.delete({ where });
    return null;
  }
  if (saved.requestHash !== scope.requestHash) throw new ApiError('IDEMPOTENCY_KEY_REUSED');
  // 이 모듈이 저장한 응답만 있으므로 형태가 보장된다
  return saved.responseBody as TResponse;
}

export async function saveIdempotentResponse(
  tx: Prisma.TransactionClient,
  scope: IdempotencyScope & { response: object },
): Promise<void> {
  await tx.idempotencyKey.create({
    data: {
      userId: scope.userId,
      key: scope.key,
      requestHash: scope.requestHash,
      responseStatus: 200,
      // 응답 DTO는 문자열·숫자·null로만 이뤄진 직렬화 가능한 객체다
      responseBody: scope.response as Prisma.InputJsonObject,
      expiresAt: new Date(scope.now.getTime() + IDEMPOTENCY_TTL_MS),
    },
  });
}
