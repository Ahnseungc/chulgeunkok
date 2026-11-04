import { CreateTermsBody } from '@/features/labor/schema';
import { createEmploymentTerms, listTermsHistory } from '@/features/labor/server/terms-service';
import { db } from '@/server/db';
import { defineRoute } from '@/server/http/define-route';

type Params = { storeId: string; memberId: string };

/** POST /api/v1/stores/:storeId/members/:memberId/employment-terms — docs/specs/labor/README.md §3.2 */
export const POST = defineRoute<typeof CreateTermsBody._output, undefined, Params>(
  { body: CreateTermsBody },
  async ({ params, body, userId }) =>
    createEmploymentTerms(db, {
      storeId: params.storeId,
      memberId: params.memberId,
      actorUserId: userId,
      body,
      now: new Date(),
    }),
);

/** GET /api/v1/stores/:storeId/members/:memberId/employment-terms — docs/specs/labor/README.md §8 */
export const GET = defineRoute<undefined, undefined, Params>({}, async ({ params, userId }) => ({
  history: await listTermsHistory(db, { storeId: params.storeId, memberId: params.memberId, actorUserId: userId }),
}));
