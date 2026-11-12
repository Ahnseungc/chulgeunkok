import { NextResponse } from 'next/server';

import { SaveQrDesignBody } from '@/features/qr-card/schema';
import { getQrDesign, saveQrDesign } from '@/features/qr-card/server/qr-design-service';
import { db } from '@/server/db';
import { defineRoute } from '@/server/http/define-route';

type Params = { storeId: string };

/** GET /api/v1/stores/:storeId/qr-design — Owner만, 저장 전이면 기본값 (docs/specs/qr-card §6) */
export const GET = defineRoute<undefined, undefined, Params>({}, async ({ params, userId }) =>
  NextResponse.json(await getQrDesign(db, { storeId: params.storeId, actorUserId: userId })),
);

/** PUT /api/v1/stores/:storeId/qr-design — Owner만 (docs/specs/qr-card §6) */
export const PUT = defineRoute<SaveQrDesignBody, undefined, Params>(
  { body: SaveQrDesignBody },
  async ({ params, body, userId }) =>
    NextResponse.json(await saveQrDesign(db, { storeId: params.storeId, actorUserId: userId, body })),
);
