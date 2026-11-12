import { NextResponse } from 'next/server';

import type { VerifyOtpResultDto } from '@/features/auth/model/me-types';
import { VerifyOtpBody } from '@/features/auth/schema';
import { setDeviceCookie } from '@/features/auth/server/device';
import { verifyOtp } from '@/features/auth/server/otp-service';
import { getSessionUserId } from '@/server/auth/session';
import { db } from '@/server/db';
import { defineRoute } from '@/server/http/define-route';

/**
 * POST /api/v1/auth/otp/verify (공개) — 성공 시 기기 쿠키. docs/specs/auth/README.md §4
 * `attach`면 세션이 있어야 하고, 기기를 새로 만들지 않고 번호만 붙인다 (§4.2)
 */
export const POST = defineRoute({ auth: 'public', body: VerifyOtpBody }, async ({ req, body }) => {
  const { deviceToken, needsName } = await verifyOtp(db, {
    phone: body.phone,
    code: body.code,
    userAgent: req.headers.get('user-agent'),
    now: new Date(),
    attachToUserId: body.attach ? await getSessionUserId(req) : null,
  });
  const response = NextResponse.json<VerifyOtpResultDto>({ needsName });
  if (deviceToken) setDeviceCookie(response, deviceToken);
  return response;
});
