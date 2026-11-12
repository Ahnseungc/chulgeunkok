import type { PrismaClient } from '@chulgeunkok/db';
import { createTestDb } from '@chulgeunkok/db/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { hashToken } from '@/server/crypto/hash-token';

import { getStoreQrUrl } from './qr-token';
import { createStore } from './store-service';
import { rotateStoreQr } from './store-settings-service';

const NOW = new Date('2026-11-12T03:00:00Z');
const ORIGIN = 'https://chulgeunkok.test';
const LEGACY_QR = 'l'.repeat(43);

let db: PrismaClient;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  await db.user.createMany({
    data: [
      { id: 'owner', name: '김사장', phone: '+821000000001' },
      { id: 'manager', name: '최매니저' },
      { id: 'employee', name: '박직원' },
    ],
  });
});

afterEach(async () => {
  vi.restoreAllMocks();
  await close();
});

const createOwnedStore = () =>
  createStore(db, {
    ownerUserId: 'owner',
    body: {
      name: '골목카페',
      address: '서울 마포구 망원로 1',
      latitude: 37.5556,
      longitude: 126.9019,
      payPeriodStartDay: 1,
      headcountBand: 'UNDER_5',
    },
    origin: ORIGIN,
    now: NOW,
  });

const qrUrl = (storeId: string, actorUserId = 'owner') =>
  getStoreQrUrl(db, { storeId, actorUserId, origin: ORIGIN });

/** 이 기능 전에 만든 매장: 암호문 없는 활성 토큰 */
async function createLegacyStore(tokenCiphertext?: string) {
  await db.store.create({ data: { id: 'legacy', name: '옛날가게' } });
  await db.membership.create({ data: { storeId: 'legacy', userId: 'owner', role: 'OWNER' } });
  await db.storeQrToken.create({ data: { storeId: 'legacy', tokenHash: hashToken(LEGACY_QR), tokenCiphertext } });
}

describe('getStoreQrUrl (docs/specs/qr-card §3.2)', () => {
  it('매장을 만들면 암호문이 저장되고 getStoreQrUrl이 같은 URL을 준다', async () => {
    const { store, qr } = await createOwnedStore();
    const token = await db.storeQrToken.findFirstOrThrow({ where: { storeId: store.id, revokedAt: null } });
    const raw = qr.url.split('/p/')[1] ?? '';

    expect(token.tokenCiphertext).toMatch(/^v1\./);
    expect(token.tokenCiphertext).not.toContain(raw);
    expect(await qrUrl(store.id)).toEqual({ url: qr.url, issuedAt: token.createdAt.toISOString() });
  });

  it('재발급하면 새 암호문, 디자인은 유지', async () => {
    const { store, qr } = await createOwnedStore();
    const before = await db.storeQrToken.findFirstOrThrow({ where: { storeId: store.id, revokedAt: null } });
    const design = await db.storeQrDesign.create({
      data: { storeId: store.id, title: '골목카페', message: '안내', updatedById: 'owner' },
    });

    const rotated = await rotateStoreQr(db, { storeId: store.id, actorUserId: 'owner', origin: ORIGIN, now: NOW });
    const after = await db.storeQrToken.findFirstOrThrow({ where: { storeId: store.id, revokedAt: null } });

    expect(rotated.url).not.toBe(qr.url);
    expect(after.tokenCiphertext).not.toBe(before.tokenCiphertext);
    expect((await qrUrl(store.id)).url).toBe(rotated.url);
    expect(await db.storeQrDesign.findUnique({ where: { storeId: store.id } })).toEqual(design);
  });

  it('암호문 없는 기존 토큰은 url null', async () => {
    await createLegacyStore();
    expect((await qrUrl('legacy')).url).toBeNull();
  });

  it('잘못된 암호문이면 url null', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await createLegacyStore('v1.broken.ciphertext');
    expect((await qrUrl('legacy')).url).toBeNull();
    expect(console.error).toHaveBeenCalledWith('[qr] 암호문 복호화 실패', 'legacy');
  });

  it('Manager는 FORBIDDEN', async () => {
    const { store } = await createOwnedStore();
    await db.membership.create({
      data: { storeId: store.id, userId: 'manager', role: 'MANAGER', permissions: ['PAYROLL_READ'] },
    });
    await expect(qrUrl(store.id, 'manager')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('Employee는 FORBIDDEN', async () => {
    const { store } = await createOwnedStore();
    await db.membership.create({ data: { storeId: store.id, userId: 'employee', role: 'EMPLOYEE', status: 'ACTIVE' } });
    await expect(qrUrl(store.id, 'employee')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
