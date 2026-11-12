import { NextResponse } from 'next/server';

import { SaveQrLogoBody } from '@/features/qr-card/schema';
import { deleteQrLogo, getQrLogo, saveQrLogo } from '@/features/qr-card/server/qr-design-service';
import { db } from '@/server/db';
import { ApiError } from '@/server/http/api-error';
import { defineRoute } from '@/server/http/define-route';

type Params = { storeId: string };

/** GET /api/v1/stores/:storeId/qr-design/logo — Owner만, 이미지 바이트 (docs/specs/qr-card §4.3·§6) */
export const GET = defineRoute<undefined, undefined, Params>({}, async ({ params, userId }) => {
  const logo = await getQrLogo(db, { storeId: params.storeId, actorUserId: userId });
  if (!logo) throw new ApiError('NOT_FOUND');
  return new Response(new Uint8Array(logo.bytes), {
    headers: { 'content-type': logo.mime, 'cache-control': 'no-store' },
  });
});

/** PUT /api/v1/stores/:storeId/qr-design/logo — Owner만, body ≈280KB까지 (docs/specs/qr-card §6·§8) */
export const PUT = defineRoute<SaveQrLogoBody, undefined, Params>(
  { body: SaveQrLogoBody },
  async ({ params, body, userId }) =>
    NextResponse.json(await saveQrLogo(db, { storeId: params.storeId, actorUserId: userId, dataUrl: body.dataUrl })),
);

/** DELETE /api/v1/stores/:storeId/qr-design/logo — Owner만 (docs/specs/qr-card §6) */
export const DELETE = defineRoute<undefined, undefined, Params>({}, async ({ params, userId }) =>
  NextResponse.json(await deleteQrLogo(db, { storeId: params.storeId, actorUserId: userId })),
);
