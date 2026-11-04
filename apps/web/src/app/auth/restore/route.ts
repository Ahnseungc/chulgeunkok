import { NextResponse, type NextRequest } from 'next/server';

import { RedeemHandoffBody } from '@/features/auth/schema';
import { setDeviceCookie } from '@/features/auth/server/device';
import { redeemHandoffCode, safeRestorePath } from '@/features/auth/server/handoff-service';
import { db } from '@/server/db';

/**
 * GET /auth/restore?code=&next= — 앱이 WebView를 열 때 기기 세션 쿠키를 심고 화면으로 보낸다 (docs/specs/auth/README.md §6.2).
 * 코드가 틀려도 화면은 연다 (그 화면이 미등록 안내를 보여 준다).
 */
export async function GET(req: NextRequest) {
  const next = safeRestorePath(req.nextUrl.searchParams.get('next'));
  const response = NextResponse.redirect(new URL(next, req.nextUrl.origin));
  const parsed = RedeemHandoffBody.safeParse({ code: req.nextUrl.searchParams.get('code') });
  if (!parsed.success) return response;
  try {
    const { deviceToken } = await redeemHandoffCode(db, {
      code: parsed.data.code,
      userAgent: req.headers.get('user-agent'),
      now: new Date(),
    });
    setDeviceCookie(response, deviceToken);
  } catch (error) {
    console.warn('[auth] 웹뷰 세션 복원 실패', error instanceof Error ? error.message : error);
  }
  return response;
}
