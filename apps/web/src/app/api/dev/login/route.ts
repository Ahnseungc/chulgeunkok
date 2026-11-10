import { NextResponse, type NextRequest } from 'next/server';

import { DEVICE_COOKIE } from '@/features/auth/server/device';
import { DEV_USERS, type DevUserId } from '@/features/dev/model/dev-screens';

const DEV_USER_COOKIE = 'dev_user_id';

const isDevUserId = (value: string | null): value is DevUserId =>
  value !== null && Object.hasOwn(DEV_USERS, value);

/** 같은 사이트 경로만 보낸다 (`//evil.com` 같은 오픈 리다이렉트 차단) */
const safeNextPath = (value: string | null) =>
  value && value.startsWith('/') && !value.startsWith('//') ? value : '/dev';

/**
 * 개발 전용 로그인 전환 (/dev 화면 목록용). `as` 사용자로 `dev_user_id` 쿠키를 심고 `next` 로 보낸다.
 * `as` 가 없으면 로그아웃 상태로 연다. 기기 세션 쿠키는 dev 쿠키보다 우선이라 함께 지운다.
 * production 에서는 404, DEV_AUTH=1 이 아니면 dev 쿠키가 무시되므로 안내만 한다 (server/auth/session.ts)
 */
export function GET(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') return new NextResponse(null, { status: 404 });
  if (process.env.DEV_AUTH !== '1') {
    return new NextResponse('apps/web/.env 에 DEV_AUTH="1" 을 넣고 dev 서버를 다시 켜 주세요.', {
      status: 409,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  const as = req.nextUrl.searchParams.get('as');
  const res = NextResponse.redirect(new URL(safeNextPath(req.nextUrl.searchParams.get('next')), req.url));
  res.cookies.delete(DEVICE_COOKIE);
  if (isDevUserId(as)) res.cookies.set(DEV_USER_COOKIE, as, { path: '/', sameSite: 'lax' });
  else res.cookies.delete(DEV_USER_COOKIE);
  return res;
}
