import type { PrismaClient } from '@chulgeunkok/db';

import { ApiError } from '@/server/http/api-error';

import type { MeDto } from '../model/me-types';

import { PENDING_NAME } from './otp-service';

/** GET /me — docs/specs/auth §8 */
export async function getMe(db: PrismaClient, userId: string): Promise<MeDto> {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: { memberships: { include: { store: true }, orderBy: { joinedAt: 'asc' } } },
  });
  // 폐기되지 않은 기기 토큰이 가리키는 사용자는 항상 있다. 없으면 개발용 세션의 잘못된 id
  if (!user) throw new ApiError('UNAUTHENTICATED');
  return {
    user: { id: user.id, name: user.name === PENDING_NAME ? null : user.name, hasPhone: !!user.phone },
    memberships: user.memberships.map((membership) => ({
      storeId: membership.storeId,
      storeName: membership.store.name,
      role: membership.role,
      status: membership.status,
    })),
  };
}

/** PATCH /me */
export async function updateMyName(db: PrismaClient, input: { userId: string; name: string }) {
  await db.user.update({ where: { id: input.userId }, data: { name: input.name } });
  return getMe(db, input.userId);
}
