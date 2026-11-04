import { rotateStoreQr } from '@/features/store/server/store-settings-service';
import { db } from '@/server/db';
import { defineRoute } from '@/server/http/define-route';

/** POST /api/v1/stores/:storeId/qr/rotate — docs/specs/store/README.md §5.2 */
export const POST = defineRoute<undefined, undefined, { storeId: string }>({}, async ({ req, params, userId }) =>
  rotateStoreQr(db, {
    storeId: params.storeId,
    actorUserId: userId,
    // 프록시 뒤에서는 요청 origin이 내부 주소일 수 있어 APP_ORIGIN을 우선한다
    origin: process.env.APP_ORIGIN ?? req.nextUrl.origin,
    now: new Date(),
  }),
);
