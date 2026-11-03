import { NextResponse } from 'next/server';

import { setDeviceCookie } from '@/features/auth/server/device';
import { AcceptInvitationBody, InvitationToken } from '@/features/staff/schema';
import { acceptInvitation } from '@/features/staff/server/invitation-service';
import { findSessionUserId } from '@/server/auth/session';
import { db } from '@/server/db';
import { ApiError } from '@/server/http/api-error';
import { defineRoute } from '@/server/http/define-route';

/**
 * POST /api/v1/invitations/:token/accept (공개) — docs/specs/staff/README.md §3.3
 * 새 기기면 HttpOnly 기기 쿠키를 심는다. 토큰 원문은 응답 본문에 넣지 않는다 (auth §6)
 */
export const POST = defineRoute<
  typeof AcceptInvitationBody._output,
  undefined,
  { token: string },
  'public'
>({ auth: 'public', body: AcceptInvitationBody }, async ({ req, params, body }) => {
  const token = InvitationToken.safeParse(params.token);
  if (!token.success) throw new ApiError('INVITATION_INVALID');

  const { deviceToken, ...result } = await acceptInvitation(db, {
    token: token.data,
    sessionUserId: await findSessionUserId(req),
    name: body.name,
    userAgent: req.headers.get('user-agent'),
    now: new Date(),
  });
  const response = NextResponse.json(result);
  if (deviceToken) setDeviceCookie(response, deviceToken);
  return response;
});
