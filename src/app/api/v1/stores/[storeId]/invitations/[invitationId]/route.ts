import { notImplemented } from '@/server/http/api-error';
import { defineRoute } from '@/server/http/define-route';

/** DELETE /api/v1/stores/:storeId/invitations/:invitationId — docs/specs/staff/README.md §3.3 */
export const DELETE = defineRoute({}, async () => notImplemented());
