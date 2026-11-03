import type { PrismaClient } from '@chulgeunkok/db';
import { createTestDb } from '@chulgeunkok/db/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getPunchPreview } from '@/features/attendance/server/punch-service';
import type { BusinessStatus } from '@/server/integrations/nts-business-status';

import type { CreateStoreInput } from '../schema';

import { createStore, MAX_OWNED_STORES, verifyBusinessNumber } from './store-service';

const NOW = new Date('2026-11-03T09:00:00Z');
const VALID_BUSINESS_NUMBER = '123-45-67891';

let db: PrismaClient;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  await db.user.createMany({
    data: [
      { id: 'owner', name: '김사장', phone: '+821000000001' },
      { id: 'staff-only', name: '이알바' },
    ],
  });
});

afterEach(async () => {
  await close();
});

const lookupReturning = (status: BusinessStatus) =>
  vi.fn(async (businessNumber: string) => ({ businessNumber, status, taxType: null }));

const body = (overrides: Partial<CreateStoreInput> = {}): CreateStoreInput => ({
  name: '골목카페 망원점',
  address: '서울 마포구 망원로 1',
  latitude: 37.5556,
  longitude: 126.9019,
  payPeriodStartDay: 1,
  headcountBand: 'UNDER_5',
  place: { provider: 'KAKAO', placeId: 'kakao-1' },
  ...overrides,
});

const create = (overrides: Partial<Parameters<typeof createStore>[1]> = {}) =>
  createStore(db, {
    ownerUserId: 'owner',
    body: body(),
    origin: 'https://chulgeunkok.test',
    now: NOW,
    lookup: lookupReturning('ACTIVE'),
    ...overrides,
  });

describe('verifyBusinessNumber', () => {
  it('체크섬이 틀리면 외부 조회 없이 BUSINESS_NUMBER_INVALID', async () => {
    const lookup = lookupReturning('ACTIVE');
    await expect(verifyBusinessNumber('123-45-67890', lookup)).rejects.toMatchObject({
      code: 'BUSINESS_NUMBER_INVALID',
    });
    expect(lookup).not.toHaveBeenCalled();
  });

  it('하이픈을 지운 번호로 조회한다', async () => {
    const lookup = lookupReturning('ACTIVE');
    await verifyBusinessNumber(VALID_BUSINESS_NUMBER, lookup);
    expect(lookup).toHaveBeenCalledWith('1234567891');
  });
});

describe('createStore', () => {
  it('매장·사장님·QR·규모 신고·파일럿 구독을 한 번에 만든다', async () => {
    const { store } = await create();
    const counts = await Promise.all([
      db.membership.count({ where: { storeId: store.id, role: 'OWNER', userId: 'owner' } }),
      db.storeQrToken.count({ where: { storeId: store.id, revokedAt: null } }),
      db.storeHeadcountDeclaration.count({ where: { storeId: store.id, band: 'UNDER_5' } }),
      db.subscription.count({ where: { storeId: store.id, plan: 'PILOT', status: 'TRIALING' } }),
    ]);
    expect(counts).toEqual([1, 1, 1, 1]);
  });

  it('돌려준 QR 주소로 바로 출퇴근 미리보기가 된다 (사장님은 근로조건이 없다)', async () => {
    const { qr } = await create();
    const qrToken = qr.url.split('/p/')[1] ?? '';
    await expect(getPunchPreview(db, { userId: 'owner', qrToken, now: NOW })).rejects.toMatchObject({
      code: 'TERMS_NOT_SET',
    });
  });

  it('규모 신고일은 서울 기준 날짜다', async () => {
    const lateNight = new Date('2026-11-03T16:00:00Z'); // 11/4 01:00 KST
    const { store } = await create({ now: lateNight });
    const declaration = await db.storeHeadcountDeclaration.findFirstOrThrow({ where: { storeId: store.id } });
    expect(declaration.effectiveFrom.toISOString().slice(0, 10)).toBe('2026-11-04');
  });

  it('영업 중인 사업자번호면 확인 시각과 함께 저장한다', async () => {
    const { store } = await create({ body: body({ businessNumber: VALID_BUSINESS_NUMBER }) });
    const saved = await db.store.findUniqueOrThrow({ where: { id: store.id } });
    expect([saved.businessNumber, saved.businessVerifiedAt]).toEqual(['1234567891', NOW]);
  });

  it('휴업·폐업 사업자는 BUSINESS_NOT_ACTIVE', async () => {
    const created = create({
      body: body({ businessNumber: VALID_BUSINESS_NUMBER }),
      lookup: lookupReturning('CLOSED'),
    });
    await expect(created).rejects.toMatchObject({ code: 'BUSINESS_NOT_ACTIVE' });
  });

  it('운영 중인 매장과 같은 가게는 STORE_PLACE_TAKEN', async () => {
    await create();
    await expect(create()).rejects.toMatchObject({ code: 'STORE_PLACE_TAKEN' });
  });

  it('폐업 처리된 매장의 가게는 다시 등록할 수 있다', async () => {
    const { store } = await create();
    await db.store.update({ where: { id: store.id }, data: { status: 'CLOSED' } });
    expect((await create()).store.name).toBe('골목카페 망원점');
  });

  it('휴대폰 인증을 하지 않은 사람은 매장을 만들 수 없다', async () => {
    await expect(create({ ownerUserId: 'staff-only' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it(`매장은 ${MAX_OWNED_STORES}개까지`, async () => {
    for (let index = 0; index < MAX_OWNED_STORES; index += 1) {
      await create({ body: body({ place: undefined, name: `매장 ${index}` }) });
    }
    await expect(create({ body: body({ place: undefined }) })).rejects.toMatchObject({
      code: 'STORE_LIMIT_REACHED',
    });
  });
});
