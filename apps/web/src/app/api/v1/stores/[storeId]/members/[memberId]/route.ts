import { UpdateMemberBody } from '@/features/staff/schema';
import { notImplemented } from '@/server/http/api-error';
import { defineRoute } from '@/server/http/define-route';

/** GET /api/v1/stores/:storeId/members/:memberId — docs/specs/staff/README.md §5.2 */
export const GET = defineRoute({}, async () => notImplemented());

/** PATCH /api/v1/stores/:storeId/members/:memberId — docs/specs/staff/README.md §4.2 */
export const PATCH = defineRoute({ body: UpdateMemberBody }, async () => notImplemented());
