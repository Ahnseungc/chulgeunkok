import type { DbClient } from '@chulgeunkok/db';
import type { NextRequest } from 'next/server';

import { DEVICE_COOKIE, findDeviceUserId } from '@/features/auth/server/device';
import { db } from '@/server/db';
import { ApiError } from '@/server/http/api-error';

const DEV_USER_HEADER = 'x-dev-user-id';
const DEV_USER_COOKIE = 'dev_user_id';

/**
 * 요청의 사용자 id. 등록된 기기 토큰이 세션이다 (docs/specs/auth §3.3). 없으면 UNAUTHENTICATED.
 * 웹·웹뷰는 `ck_device` 쿠키, 앱 네이티브 호출은 `Authorization: Bearer`.
 *
 * 개발 전용: DEV_AUTH=1 이고 production이 아닐 때 `x-dev-user-id` 헤더(API 호출)·
 * `dev_user_id` 쿠키(브라우저)도 받는다. 사장님 휴대폰 인증(auth §4) 전까지 사장님 화면용.
 */
export async function getSessionUserId(req: NextRequest, database: DbClient = db): Promise<string> {
  const deviceToken = req.cookies.get(DEVICE_COOKIE)?.value ?? readBearerToken(req);
  if (deviceToken) {
    const userId = await findDeviceUserId(database, deviceToken);
    if (userId) return userId;
  }
  if (isDevAuthEnabled()) {
    const devUserId =
      req.headers.get(DEV_USER_HEADER) ?? req.cookies.get(DEV_USER_COOKIE)?.value;
    if (devUserId) return devUserId;
  }
  throw new ApiError('UNAUTHENTICATED');
}

/** 공개 라우트에서 선택적으로 세션을 읽을 때. 없으면 null */
export async function findSessionUserId(
  req: NextRequest,
  database: DbClient = db,
): Promise<string | null> {
  try {
    return await getSessionUserId(req, database);
  } catch (error) {
    if (error instanceof ApiError && error.code === 'UNAUTHENTICATED') return null;
    throw error;
  }
}

/** RN 앱 네이티브 코드가 API를 직접 부를 때 (docs/specs/auth §6). 웹뷰는 쿠키를 쓴다 */
function readBearerToken(req: NextRequest): string | undefined {
  const [scheme, token] = req.headers.get('authorization')?.split(' ') ?? [];
  return scheme === 'Bearer' && token ? token : undefined;
}

function isDevAuthEnabled(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.DEV_AUTH === '1';
}
