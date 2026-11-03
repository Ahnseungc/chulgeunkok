import type { NextRequest } from 'next/server';

import { ApiError } from '@/server/http/api-error';

const DEV_USER_HEADER = 'x-dev-user-id';

/**
 * 요청의 로그인 사용자 id. 없으면 UNAUTHENTICATED.
 *
 * ponytail: NextAuth v5(카카오·휴대폰 OTP, docs/specs/auth) 연결 전 임시 구현.
 * DEV_AUTH=1 이고 production이 아닐 때만 `x-dev-user-id` 헤더를 세션으로 쓴다.
 * 업그레이드: `auth()` 세션의 userId로 교체하고 이 헤더 분기는 삭제한다.
 */
export async function getSessionUserId(req: NextRequest): Promise<string> {
  if (isDevAuthEnabled()) {
    const devUserId = req.headers.get(DEV_USER_HEADER);
    if (devUserId) return devUserId;
  }
  throw new ApiError('UNAUTHENTICATED');
}

function isDevAuthEnabled(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.DEV_AUTH === '1';
}
