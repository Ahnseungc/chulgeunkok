import { CreateStoreBody } from '@/features/store/schema';
import { createStore } from '@/features/store/server/store-service';
import { db } from '@/server/db';
import { notImplemented } from '@/server/http/api-error';
import { defineRoute } from '@/server/http/define-route';

/** POST /api/v1/stores — docs/specs/store/README.md §3.3 */
export const POST = defineRoute({ body: CreateStoreBody }, async ({ req, body, userId }) =>
  createStore(db, {
    ownerUserId: userId,
    body,
    // 프록시 뒤에서는 요청 origin이 내부 주소일 수 있어 APP_ORIGIN을 우선한다
    origin: process.env.APP_ORIGIN ?? req.nextUrl.origin,
    now: new Date(),
  }),
);

/** GET /api/v1/stores — docs/specs/store/README.md §8 */
export const GET = defineRoute({}, async () => notImplemented());
