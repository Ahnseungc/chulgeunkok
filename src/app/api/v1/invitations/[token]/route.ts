import { notImplemented } from '@/server/http/api-error';
import { defineRoute } from '@/server/http/define-route';

/** GET /api/v1/invitations/:token — docs/specs/staff/README.md §3.2 */
export const GET = defineRoute({ auth: 'public' }, async () => notImplemented());
