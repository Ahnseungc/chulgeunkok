import { CorrectionListQuery } from '@/features/attendance/schema';
import { listStoreCorrections } from '@/features/attendance/server/correction-service';
import { db } from '@/server/db';
import { defineRoute } from '@/server/http/define-route';

/** GET /api/v1/stores/:storeId/correction-requests — 관리자 (docs/specs/attendance/README.md §9) */
export const GET = defineRoute<undefined, typeof CorrectionListQuery._output, { storeId: string }>(
  { query: CorrectionListQuery },
  async ({ params, query, userId }) => ({
    requests: await listStoreCorrections(db, { storeId: params.storeId, actorUserId: userId, status: query.status }),
  }),
);
