/** QR 카드 디자인·로고 저장. 정본: docs/specs/qr-card §4·§6 (Owner만) */

import type { PrismaClient, StoreQrDesign } from '@chulgeunkok/db';

import { requireMembership } from '@/server/auth/require-membership';
import { ApiError } from '@/server/http/api-error';

import {
  QR_CARD_DEFAULT_MESSAGE,
  QR_CARD_TITLE_MAX,
  type QrCardColorKey,
  type QrCardDesignDto,
} from '../model/qr-card-types';
import type { SaveQrDesignBody } from '../schema';

import { parseLogoDataUrl } from './logo-image';

interface QrDesignActor {
  storeId: string;
  actorUserId: string;
}

const toDto = (row: StoreQrDesign): QrCardDesignDto => ({
  layout: row.layout,
  color: row.color as QrCardColorKey,
  title: row.title,
  message: row.message,
  hasLogo: row.logo !== null,
  saved: true,
});

async function requireOwner(db: PrismaClient, input: QrDesignActor) {
  await requireMembership({ storeId: input.storeId, userId: input.actorUserId, action: 'STORE_ADMIN' }, db);
}

async function storeName(db: PrismaClient, storeId: string): Promise<string> {
  const store = await db.store.findUnique({ where: { id: storeId }, select: { name: true } });
  if (!store) throw new ApiError('NOT_FOUND');
  return store.name;
}

/**
 * 매장 이름(30자까지)을 카드 제목 상한(20자, §4.1)에 맞춰 자른다.
 * 코드 포인트 단위라 이모지를 반으로 가르지 않고, 검증(zod max, UTF-16 길이)도 넘지 않는다.
 */
export function defaultQrCardTitle(name: string): string {
  let title = '';
  for (const char of name) {
    if (title.length + char.length > QR_CARD_TITLE_MAX) break;
    title += char;
  }
  return title.trimEnd();
}

/** 저장한 적 없으면 기본값 (§4.1). 매장 이름(20자로 자름)은 처음 저장할 때만 title로 고정된다 */
export async function getQrDesign(db: PrismaClient, input: QrDesignActor): Promise<QrCardDesignDto> {
  await requireOwner(db, input);
  const row = await db.storeQrDesign.findUnique({ where: { storeId: input.storeId } });
  if (row) return toDto(row);
  return {
    layout: 'STAND',
    color: 'kok',
    title: defaultQrCardTitle(await storeName(db, input.storeId)),
    message: QR_CARD_DEFAULT_MESSAGE,
    hasLogo: false,
    saved: false,
  };
}

export async function saveQrDesign(
  db: PrismaClient,
  input: QrDesignActor & { body: SaveQrDesignBody },
): Promise<QrCardDesignDto> {
  await requireOwner(db, input);
  const row = await db.storeQrDesign.upsert({
    where: { storeId: input.storeId },
    create: { storeId: input.storeId, ...input.body, updatedById: input.actorUserId },
    update: { ...input.body, updatedById: input.actorUserId },
  });
  return toDto(row);
}

/** 디자인 행이 없으면 기본값으로 만들고 로고만 넣는다 */
export async function saveQrLogo(
  db: PrismaClient,
  input: QrDesignActor & { dataUrl: string },
): Promise<QrCardDesignDto> {
  await requireOwner(db, input);
  const { bytes, mime } = parseLogoDataUrl(input.dataUrl);
  const logo = { logo: new Uint8Array(bytes), logoMime: mime, updatedById: input.actorUserId };
  const row = await db.storeQrDesign.upsert({
    where: { storeId: input.storeId },
    create: {
      storeId: input.storeId,
      title: defaultQrCardTitle(await storeName(db, input.storeId)),
      message: QR_CARD_DEFAULT_MESSAGE,
      ...logo,
    },
    update: logo,
  });
  return toDto(row);
}

export async function deleteQrLogo(db: PrismaClient, input: QrDesignActor): Promise<QrCardDesignDto> {
  await requireOwner(db, input);
  await db.storeQrDesign.updateMany({
    where: { storeId: input.storeId },
    data: { logo: null, logoMime: null, updatedById: input.actorUserId },
  });
  return getQrDesign(db, input);
}

export async function getQrLogo(
  db: PrismaClient,
  input: QrDesignActor,
): Promise<{ bytes: Buffer; mime: string } | null> {
  await requireOwner(db, input);
  const row = await db.storeQrDesign.findUnique({
    where: { storeId: input.storeId },
    select: { logo: true, logoMime: true },
  });
  if (!row?.logo || !row.logoMime) return null;
  return { bytes: Buffer.from(row.logo), mime: row.logoMime };
}
