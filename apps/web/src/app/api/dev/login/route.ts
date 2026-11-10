import { NextResponse, type NextRequest } from 'next/server';

import { DEVICE_COOKIE } from '@/features/auth/server/device';
import { DEV_USERS, type DevUserId } from '@/features/dev/model/dev-screens';

const DEV_USER_COOKIE = 'dev_user_id';

const isDevUserId = (value: string | null): value is DevUserId =>
  value !== null && Object.hasOwn(DEV_USERS, value);

/**
 * 개발 전용 로그인 전환 (/dev 화면 목록용). `as` 사용자로 `dev_user_id` 쿠키를 심는다. `as` 가 없으면 로그아웃.
 * 기기 세션 쿠키는 dev 쿠키보다 우선이라 함께 지운다.
 * ponytail: 리다이렉트(307)로 화면까지 보내면 앱 WebView 가 이동을 놓쳐서, 쿠키만 심고 이동은 호출한 쪽이 한다.
 * production 에서는 404, DEV_AUTH=1 이 아니면 dev 쿠키가 무시되므로 409 (server/auth/session.ts)
 */
export function POST(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') return new NextResponse(null, { status: 404 });
  if (process.env.DEV_AUTH !== '1') {
    return NextResponse.json(
      { error: { code: 'DEV_AUTH_DISABLED', message: 'apps/web/.env 에 DEV_AUTH="1" 을 넣고 dev 서버를 다시 켜 주세요.' } },
      { status: 409 },
    );
  }

  const as = req.nextUrl.searchParams.get('as');
  const res = new NextResponse(null, { status: 204 });
  res.cookies.delete(DEVICE_COOKIE);
  if (isDevUserId(as)) res.cookies.set(DEV_USER_COOKIE, as, { path: '/', sameSite: 'lax' });
  else res.cookies.delete(DEV_USER_COOKIE);
  return res;
}
