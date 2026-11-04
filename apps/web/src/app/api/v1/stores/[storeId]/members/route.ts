import { MemberListQuery } from '@/features/staff/schema';
import { listMembers } from '@/features/staff/server/member-service';
import { db } from '@/server/db';
import { defineRoute } from '@/server/http/define-route';

/** GET /api/v1/stores/:storeId/members — docs/specs/staff/README.md §5.1 */
export const GET = defineRoute<undefined, typeof MemberListQuery._output, { storeId: string }>(
  { query: MemberListQuery },
  async ({ params, query, userId }) => ({
    members: await listMembers(db, { storeId: params.storeId, actorUserId: userId, status: query.status }),
  }),
);
