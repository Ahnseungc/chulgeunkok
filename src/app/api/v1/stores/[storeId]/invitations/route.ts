import { CreateInvitationBody, InvitationListQuery } from '@/features/staff/schema';
import { notImplemented } from '@/server/http/api-error';
import { defineRoute } from '@/server/http/define-route';

/** POST /api/v1/stores/:storeId/invitations — docs/specs/staff/README.md §3.1 */
export const POST = defineRoute({ body: CreateInvitationBody }, async () => notImplemented());

/** GET /api/v1/stores/:storeId/invitations — docs/specs/staff/README.md §6 */
export const GET = defineRoute({ query: InvitationListQuery }, async () => notImplemented());
