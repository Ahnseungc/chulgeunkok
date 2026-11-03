import { VerifyBusinessBody } from '@/features/store/schema';
import { verifyBusinessNumber } from '@/features/store/server/store-service';
import { defineRoute } from '@/server/http/define-route';

/** POST /api/v1/business-registrations/verify — docs/specs/store/README.md §3.2 */
export const POST = defineRoute({ body: VerifyBusinessBody }, async ({ body }) =>
  verifyBusinessNumber(body.businessNumber),
);
