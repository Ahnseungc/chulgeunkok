import type { DbClient, Membership } from '@chulgeunkok/db';

import { db } from '@/server/db';
import { ApiError } from '@/server/http/api-error';

import { canAccessStore, needsVerifiedPhone, type StoreAction } from './access';

/**
 * 매장 API 공통 가드. docs/specs/README.md §2.4·§2.5
 * - Membership 없음 → NOT_FOUND (다른 매장 존재 여부를 숨긴다)
 * - 비활성 → FORBIDDEN
 * - 동작 권한 없음 → FORBIDDEN
 * - 급여·시급을 보는 Manager가 휴대폰 인증 전 → PHONE_VERIFICATION_REQUIRED (auth §4.2, access.needsVerifiedPhone)
 */
export async function requireMembership(
  input: { storeId: string; userId: string; action: StoreAction },
  database: DbClient = db,
): Promise<Membership> {
  const membership = await database.membership.findUnique({
    where: { storeId_userId: { storeId: input.storeId, userId: input.userId } },
  });
  if (!membership) throw new ApiError('NOT_FOUND');
  if (membership.status !== 'ACTIVE') throw new ApiError('FORBIDDEN');
  if (!canAccessStore(membership, input.action)) throw new ApiError('FORBIDDEN');
  if (needsVerifiedPhone(membership, input.action) && !(await hasVerifiedPhone(database, input.userId))) {
    throw new ApiError('PHONE_VERIFICATION_REQUIRED');
  }
  return membership;
}

/**
 * 실패 대신 값을 숨길 때(대시보드 금액·검토 수, 직원 상세 근로조건 등) 쓰는 판정. requireMembership과 같은 규칙.
 * 활성 여부는 호출부가 본다.
 */
export async function canAccessVerified(database: DbClient, membership: Membership, action: StoreAction): Promise<boolean> {
  if (!canAccessStore(membership, action)) return false;
  return !needsVerifiedPhone(membership, action) || hasVerifiedPhone(database, membership.userId);
}

async function hasVerifiedPhone(database: DbClient, userId: string): Promise<boolean> {
  const user = await database.user.findUnique({ where: { id: userId }, select: { phone: true } });
  return Boolean(user?.phone);
}
