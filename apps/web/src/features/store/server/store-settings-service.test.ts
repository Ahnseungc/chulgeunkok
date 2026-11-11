import type { PrismaClient } from '@chulgeunkok/db';
import { createTestDb } from '@chulgeunkok/db/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getPunchPreview } from '@/features/attendance/server/punch-service';
import { hashToken } from '@/server/crypto/hash-token';

import { declareHeadcount, getStoreSettings, rotateStoreQr, updateStore } from './store-settings-service';

const kst = (local: string) => new Date(`${local}+09:00`);
const NOW = kst('2026-11-15T12:00:00');
const OLD_QR = 'o'.repeat(43);

let db: PrismaClient;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  await db.user.createMany({ data: [{ id: 'owner', name: '김사장' }, { id: 'manager', name: '최매니저' }] });
  await db.store.create({ data: { id: 'store', name: '골목카페' } });
  await db.membership.createMany({
    data: [
      { id: 'm-owner', storeId: 'store', userId: 'owner', role: 'OWNER' },
      { id: 'm-manager', storeId: 'store', userId: 'manager', role: 'MANAGER', permissions: ['PAYROLL_READ'] },
    ],
  });
  await db.storeQrToken.create({ data: { storeId: 'store', tokenHash: hashToken(OLD_QR) } });
  await db.storeHeadcountDeclaration.create({
    data: { storeId: 'store', band: 'UNKNOWN', effectiveFrom: new Date('2026-11-01'), declaredById: 'owner' },
  });
});

afterEach(async () => {
  await close();
});

const settings = (now = NOW) => getStoreSettings(db, { storeId: 'store', actorUserId: 'owner', now });
const changeStartDay = (payPeriodStartDay: number, now = NOW) =>
  updateStore(db, { storeId: 'store', actorUserId: 'owner', body: { payPeriodStartDay }, now });

describe('정산 시작일', () => {
  it('바꾸면 지금 기간은 그대로, 다음 기간부터 적용된다', async () => {
    const result = await changeStartDay(21);
    expect([result.payPeriod.currentStartDay, result.payPeriod.pendingChange, result.payPeriod.currentPeriod]).toEqual([
      1,
      { startDay: 21, effectiveFrom: '2026-12-01' },
      { start: '2026-11-01', end: '2026-12-01' },
    ]);
  });

  it('적용일이 지나면 새 시작일이 현재 값이 된다', async () => {
    await changeStartDay(21);
    const later = await settings(kst('2026-12-05T12:00:00'));
    expect([later.payPeriod.currentStartDay, later.payPeriod.pendingChange, later.payPeriod.currentPeriod]).toEqual([
      21,
      null,
      { start: '2026-12-01', end: '2026-12-21' },
    ]);
  });

  it('대기 중에 원래 값으로 되돌리면 변경이 취소된다', async () => {
    await changeStartDay(21);
    const reverted = await changeStartDay(1);
    expect(reverted.payPeriod.pendingChange).toBeNull();
  });

  it('대기 중에 다른 값으로 바꾸면 적용일은 그대로 값만 바뀐다', async () => {
    await changeStartDay(21);
    const changed = await changeStartDay(15);
    expect(changed.payPeriod.pendingChange).toEqual({ startDay: 15, effectiveFrom: '2026-12-01' });
  });
});

describe('급여 지급일', () => {
  it('처음엔 비어 있고, 저장하면 설정에 보인다', async () => {
    expect((await settings()).payDay).toBeNull();
    const saved = await updateStore(db, { storeId: 'store', actorUserId: 'owner', body: { payDay: 10 }, now: NOW });
    expect(saved.payDay).toBe(10);
  });

  it('null로 보내면 지운다', async () => {
    await updateStore(db, { storeId: 'store', actorUserId: 'owner', body: { payDay: 25 }, now: NOW });
    const cleared = await updateStore(db, { storeId: 'store', actorUserId: 'owner', body: { payDay: null }, now: NOW });
    expect(cleared.payDay).toBeNull();
  });
});

describe('사업장 규모', () => {
  it('신고하면 오늘부터 현재 값이 되고 이력이 남는다', async () => {
    const result = await declareHeadcount(db, {
      storeId: 'store',
      actorUserId: 'owner',
      body: { band: 'UNDER_5', effectiveFrom: '2026-11-15' },
      now: NOW,
    });
    expect([result.headcount.current, result.headcount.history.map((row) => row.band)]).toEqual(['UNDER_5', ['UNDER_5', 'UNKNOWN']]);
  });

  it('90일보다 이전이나 미래 날짜는 HEADCOUNT_DATE_OUT_OF_RANGE', async () => {
    for (const effectiveFrom of ['2026-08-01', '2026-11-16']) {
      await expect(
        declareHeadcount(db, { storeId: 'store', actorUserId: 'owner', body: { band: 'UNDER_5', effectiveFrom }, now: NOW }),
      ).rejects.toMatchObject({ code: 'HEADCOUNT_DATE_OUT_OF_RANGE' });
    }
  });

  it('같은 날짜로 다시 신고하면 덮어쓴다', async () => {
    const result = await declareHeadcount(db, {
      storeId: 'store',
      actorUserId: 'owner',
      body: { band: 'FIVE_OR_MORE', effectiveFrom: '2026-11-01' },
      now: NOW,
    });
    expect(result.headcount.history).toHaveLength(1);
  });
});

describe('QR 재발급', () => {
  it('이전 QR은 바로 폐기되고 새 QR만 쓸 수 있다', async () => {
    const { url } = await rotateStoreQr(db, { storeId: 'store', actorUserId: 'owner', origin: 'https://x.test', now: NOW });
    await expect(getPunchPreview(db, { userId: 'owner', qrToken: OLD_QR, now: NOW })).rejects.toMatchObject({
      code: 'QR_TOKEN_REVOKED',
    });
    // 사장님은 근로조건이 없어 TERMS_NOT_SET까지 가면 새 QR은 인식된 것이다
    await expect(getPunchPreview(db, { userId: 'owner', qrToken: url.split('/p/')[1] ?? '', now: NOW })).rejects.toMatchObject({
      code: 'TERMS_NOT_SET',
    });
  });
});

describe('권한', () => {
  it('매니저는 매장 설정을 볼 수 없다', async () => {
    await expect(getStoreSettings(db, { storeId: 'store', actorUserId: 'manager', now: NOW })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});
