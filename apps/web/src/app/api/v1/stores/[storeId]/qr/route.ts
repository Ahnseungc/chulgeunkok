import { NextResponse } from 'next/server';

import { getStoreQrUrl } from '@/features/store/server/qr-token';
import { db } from '@/server/db';
import { defineRoute } from '@/server/http/define-route';

/** GET /api/v1/stores/:storeId/qr — Owner만, 캐시 금지 (docs/specs/qr-card §3.2) */
export const GET = defineRoute<undefined, undefined, { storeId: string }>({}, async ({ req, params, userId }) =>
  NextResponse.json(
    await getStoreQrUrl(db, {
      storeId: params.storeId,
      actorUserId: userId,
      // 프록시 뒤에서는 요청 origin이 내부 주소일 수 있어 APP_ORIGIN을 우선한다
      origin: process.env.APP_ORIGIN ?? req.nextUrl.origin,
    }),
    { headers: { 'Cache-Control': 'no-store' } },
  ),
);
