import { CreateInvitationBody, InvitationListQuery } from '@/features/staff/schema';
import { createInvitation } from '@/features/staff/server/invitation-service';
import { db } from '@/server/db';
import { notImplemented } from '@/server/http/api-error';
import { defineRoute } from '@/server/http/define-route';

/** POST /api/v1/stores/:storeId/invitations — docs/specs/staff/README.md §3.1 */
export const POST = defineRoute<
  typeof CreateInvitationBody._output,
  undefined,
  { storeId: string }
>({ body: CreateInvitationBody }, async ({ req, body, params, userId }) =>
  createInvitation(db, {
    storeId: params.storeId,
    actorUserId: userId,
    body,
    // 프록시 뒤에서는 요청 origin이 내부 주소일 수 있어 APP_ORIGIN을 우선한다
    origin: process.env.APP_ORIGIN ?? req.nextUrl.origin,
    now: new Date(),
  }),
);

/** GET /api/v1/stores/:storeId/invitations — docs/specs/staff/README.md §6 */
export const GET = defineRoute({ query: InvitationListQuery }, async () => notImplemented());
