import { InvitationToken } from '@/features/staff/schema';
import { getInvitationInfo } from '@/features/staff/server/invitation-service';
import { findSessionUserId } from '@/server/auth/session';
import { db } from '@/server/db';
import { ApiError } from '@/server/http/api-error';
import { defineRoute } from '@/server/http/define-route';

/** GET /api/v1/invitations/:token (공개) — docs/specs/staff/README.md §3.2 */
export const GET = defineRoute<undefined, undefined, { token: string }, 'public'>(
  { auth: 'public' },
  async ({ req, params }) => {
    const token = InvitationToken.safeParse(params.token);
    if (!token.success) throw new ApiError('INVITATION_INVALID');
    return getInvitationInfo(db, {
      token: token.data,
      sessionUserId: await findSessionUserId(req),
      now: new Date(),
    });
  },
);
