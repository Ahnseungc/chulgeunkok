import { MemberListQuery } from '@/features/staff/schema';
import { notImplemented } from '@/server/http/api-error';
import { defineRoute } from '@/server/http/define-route';

/** GET /api/v1/stores/:storeId/members — docs/specs/staff/README.md §5.1 */
export const GET = defineRoute({ query: MemberListQuery }, async () => notImplemented());
