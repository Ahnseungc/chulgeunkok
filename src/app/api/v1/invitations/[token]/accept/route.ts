import { notImplemented } from '@/server/http/api-error';
import { defineRoute } from '@/server/http/define-route';

/** POST /api/v1/invitations/:token/accept — docs/specs/staff/README.md §3.2 */
export const POST = defineRoute({}, async () => notImplemented());
