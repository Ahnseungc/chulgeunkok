import type { Membership } from '@prisma/client';

import { db } from '@/server/db';
import { ApiError } from '@/server/http/api-error';

import { canAccessStore, type StoreAction } from './access';

/**
 * 매장 API 공통 가드. docs/specs/README.md §2.4·§2.5
 * - Membership 없음 → NOT_FOUND (다른 매장 존재 여부를 숨긴다)
 * - 비활성 → FORBIDDEN
 * - 동작 권한 없음 → FORBIDDEN
 */
export async function requireMembership(input: {
  storeId: string;
  userId: string;
  action: StoreAction;
}): Promise<Membership> {
  const membership = await db.membership.findUnique({
    where: { storeId_userId: { storeId: input.storeId, userId: input.userId } },
  });
  if (!membership) throw new ApiError('NOT_FOUND');
  if (membership.status !== 'ACTIVE') throw new ApiError('FORBIDDEN');
  if (!canAccessStore(membership, input.action)) throw new ApiError('FORBIDDEN');
  return membership;
}
