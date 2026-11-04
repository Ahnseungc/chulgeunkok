import { UpdateMemberBody } from '@/features/staff/schema';
import { getMember, updateMember } from '@/features/staff/server/member-service';
import { db } from '@/server/db';
import { defineRoute } from '@/server/http/define-route';

type Params = { storeId: string; memberId: string };

/** GET /api/v1/stores/:storeId/members/:memberId — docs/specs/staff/README.md §5.2 */
export const GET = defineRoute<undefined, undefined, Params>({}, async ({ params, userId }) =>
  getMember(db, { storeId: params.storeId, memberId: params.memberId, actorUserId: userId }),
);

/** PATCH /api/v1/stores/:storeId/members/:memberId — docs/specs/staff/README.md §4 */
export const PATCH = defineRoute<typeof UpdateMemberBody._output, undefined, Params>(
  { body: UpdateMemberBody },
  async ({ params, body, userId }) =>
    updateMember(db, {
      storeId: params.storeId,
      memberId: params.memberId,
      actorUserId: userId,
      change: body,
      now: new Date(),
    }),
);
