import { listMembershipEvents } from '@/features/staff/server/membership-events';
import { db } from '@/server/db';
import { defineRoute } from '@/server/http/define-route';

/** GET /api/v1/stores/:storeId/members/:memberId/events — 역할·권한·상태 변경 이력, 사장님만 (docs/specs/staff/README.md §4.3) */
export const GET = defineRoute<undefined, undefined, { storeId: string; memberId: string }>(
  {},
  async ({ params, userId }) => ({
    events: await listMembershipEvents(db, { storeId: params.storeId, memberId: params.memberId, actorUserId: userId }),
  }),
);
