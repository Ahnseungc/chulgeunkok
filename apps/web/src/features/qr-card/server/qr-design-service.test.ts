import type { PrismaClient } from '@chulgeunkok/db';
import { createTestDb } from '@chulgeunkok/db/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createStore } from '@/features/store/server/store-service';
import { ApiError } from '@/server/http/api-error';

import { QR_CARD_DEFAULT_MESSAGE } from '../model/qr-card-types';

import { defaultQrCardTitle, deleteQrLogo, getQrDesign, getQrLogo, saveQrDesign, saveQrLogo } from './qr-design-service';

let db: PrismaClient;
let close: () => Promise<void>;
let storeId: string;

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(8)]);
const PNG_URL = `data:image/png;base64,${PNG.toString('base64')}`;
/** 매장 이름 상한 30자 (store schema) */
const NAME_30 = '가나다라마바사아자차'.repeat(3);
const BODY = { layout: 'STICKER', color: 'blue', title: '내 카페', message: '' } as const;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  await db.user.createMany({
    data: [
      { id: 'owner', name: '김사장', phone: '+821000000001' },
      { id: 'manager', name: '최매니저' },
      { id: 'employee', name: '박직원' },
    ],
  });
  const store = await createStore(db, {
    ownerUserId: 'owner',
    body: {
      name: '골목카페',
      address: '서울 마포구 망원로 1',
      latitude: 37.5556,
      longitude: 126.9019,
      payPeriodStartDay: 1,
      headcountBand: 'UNDER_5',
    },
    origin: 'https://chulgeunkok.test',
    now: new Date('2026-11-12T03:00:00Z'),
  });
  storeId = store.store.id;
  await db.membership.createMany({
    data: [
      { storeId, userId: 'manager', role: 'MANAGER', status: 'ACTIVE' },
      { storeId, userId: 'employee', role: 'EMPLOYEE', status: 'ACTIVE' },
    ],
  });
});

afterEach(async () => {
  await close();
});

const owner = () => ({ storeId, actorUserId: 'owner' });

describe('qr-design-service', () => {
  it('저장 전에는 매장 이름·기본 문구로 saved false', async () => {
    expect(await getQrDesign(db, owner())).toEqual({
      layout: 'STAND',
      color: 'kok',
      title: '골목카페',
      message: QR_CARD_DEFAULT_MESSAGE,
      hasLogo: false,
      saved: false,
    });
  });

  it('저장하면 다시 읽어도 같다', async () => {
    const saved = await saveQrDesign(db, { ...owner(), body: BODY });
    expect(saved).toEqual({ ...BODY, hasLogo: false, saved: true });
    expect(await getQrDesign(db, owner())).toEqual(saved);
    const row = await db.storeQrDesign.findUniqueOrThrow({ where: { storeId } });
    expect(row.updatedById).toBe('owner');
  });

  it('매장 이름을 바꿔도 저장된 title은 그대로', async () => {
    await saveQrDesign(db, { ...owner(), body: BODY });
    await db.store.update({ where: { id: storeId }, data: { name: '새이름' } });
    expect((await getQrDesign(db, owner())).title).toBe('내 카페');
  });

  it('로고 올리고 지우기', async () => {
    expect((await saveQrLogo(db, { ...owner(), dataUrl: PNG_URL })).hasLogo).toBe(true);
    const logo = await getQrLogo(db, owner());
    expect(logo?.mime).toBe('image/png');
    expect(logo?.bytes.equals(PNG)).toBe(true);
    expect((await deleteQrLogo(db, owner())).hasLogo).toBe(false);
    expect(await getQrLogo(db, owner())).toBeNull();
  });

  it('로고를 올려도 저장한 디자인은 유지', async () => {
    await saveQrDesign(db, { ...owner(), body: BODY });
    const next = await saveQrLogo(db, { ...owner(), dataUrl: PNG_URL });
    expect(next).toMatchObject({ ...BODY, hasLogo: true });
    const again = await saveQrDesign(db, { ...owner(), body: { ...BODY, color: 'green' } });
    expect(again).toMatchObject({ color: 'green', hasLogo: true });
  });

  it('30자 매장 이름은 기본 title 20자로 자른다', async () => {
    await db.store.update({ where: { id: storeId }, data: { name: NAME_30 } });
    expect((await getQrDesign(db, owner())).title).toBe(NAME_30.slice(0, 20));
  });

  it('30자 매장 이름 매장에 로고를 먼저 올려도 title은 20자로 저장된다', async () => {
    await db.store.update({ where: { id: storeId }, data: { name: NAME_30 } });
    expect((await saveQrLogo(db, { ...owner(), dataUrl: PNG_URL })).title).toBe(NAME_30.slice(0, 20));
    const row = await db.storeQrDesign.findUniqueOrThrow({ where: { storeId } });
    expect(row.title).toBe(NAME_30.slice(0, 20));
  });

  it('Manager·Employee는 FORBIDDEN', async () => {
    for (const actorUserId of ['manager', 'employee']) {
      const input = { storeId, actorUserId };
      const calls = [
        getQrDesign(db, input),
        saveQrDesign(db, { ...input, body: BODY }),
        saveQrLogo(db, { ...input, dataUrl: PNG_URL }),
        deleteQrLogo(db, input),
        getQrLogo(db, input),
      ];
      for (const call of calls) {
        await expect(call).rejects.toMatchObject({ code: 'FORBIDDEN' });
        await expect(call).rejects.toBeInstanceOf(ApiError);
      }
    }
  });
});

describe('defaultQrCardTitle (§4.1)', () => {
  it('20자 이하는 그대로', () => {
    expect(defaultQrCardTitle('골목카페')).toBe('골목카페');
  });

  it('이모지를 반으로 가르지 않고 UTF-16 20 이하로 자른다', () => {
    const title = defaultQrCardTitle(`${'가'.repeat(19)}🍰`);
    expect(title).toBe('가'.repeat(19));
    expect(title.length).toBeLessThanOrEqual(20);
  });
});
