import { PunchBody } from '@/features/attendance/schema';
import { punch } from '@/features/attendance/server/punch-service';
import { db } from '@/server/db';
import { ApiError } from '@/server/http/api-error';
import { defineRoute } from '@/server/http/define-route';
import { IdempotencyKey } from '@/shared/schema/common';

/** POST /api/v1/attendance/punch — docs/specs/attendance/README.md §3.3 */
export const POST = defineRoute({ body: PunchBody }, async ({ req, body, userId }) => {
  const idempotencyKey = IdempotencyKey.safeParse(req.headers.get('idempotency-key'));
  if (!idempotencyKey.success) {
    throw new ApiError('VALIDATION_FAILED', { message: 'Idempotency-Key 헤더가 필요해요.' });
  }
  return punch(db, { userId, ...body, idempotencyKey: idempotencyKey.data, now: new Date() });
});
