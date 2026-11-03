import { NextResponse } from 'next/server';

import type { VerifyOtpResultDto } from '@/features/auth/model/me-types';
import { VerifyOtpBody } from '@/features/auth/schema';
import { setDeviceCookie } from '@/features/auth/server/device';
import { verifyOtp } from '@/features/auth/server/otp-service';
import { db } from '@/server/db';
import { defineRoute } from '@/server/http/define-route';

/** POST /api/v1/auth/otp/verify (공개) — 성공 시 기기 쿠키. docs/specs/auth/README.md §4 */
export const POST = defineRoute({ auth: 'public', body: VerifyOtpBody }, async ({ req, body }) => {
  const { deviceToken, needsName } = await verifyOtp(db, {
    phone: body.phone,
    code: body.code,
    userAgent: req.headers.get('user-agent'),
    now: new Date(),
  });
  const response = NextResponse.json<VerifyOtpResultDto>({ needsName });
  setDeviceCookie(response, deviceToken);
  return response;
});
