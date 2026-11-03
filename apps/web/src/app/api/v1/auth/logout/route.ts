import { NextResponse } from 'next/server';

import { clearDeviceCookie, DEVICE_COOKIE, revokeDeviceToken } from '@/features/auth/server/device';
import { db } from '@/server/db';
import { defineRoute } from '@/server/http/define-route';

/** POST /api/v1/auth/logout (공개) — 이 기기만 폐기. docs/specs/auth/README.md §8 */
export const POST = defineRoute({ auth: 'public' }, async ({ req }) => {
  const token = req.cookies.get(DEVICE_COOKIE)?.value;
  if (token) await revokeDeviceToken(db, { token, now: new Date() });
  const response = NextResponse.json({ ok: true });
  clearDeviceCookie(response);
  return response;
});
