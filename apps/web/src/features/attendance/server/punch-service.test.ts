import type { PrismaClient } from '@chulgeunkok/db';
import { createTestDb } from '@chulgeunkok/db/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { hashToken } from '@/server/crypto/hash-token';
import { IDEMPOTENCY_TTL_MS } from '@/server/http/idempotency';

import { getCurrentAttendance, getPunchPreview, punch } from './punch-service';

const QR_TOKEN = 'a'.repeat(43);
const REVOKED_QR_TOKEN = 'b'.repeat(43);
const CLOCK_IN_AT = new Date('2026-11-02T09:00:00Z'); // 월 18:00 KST
const ONE_HOUR_LATER = new Date('2026-11-02T10:00:00Z');

let db: PrismaClient;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  await db.user.createMany({
    data: [
      { id: 'owner', name: '사장', phone: '+821000000001' },
      { id: 'staff', name: '알바', phone: '+821000000002' },
      { id: 'stranger', name: '외부인', phone: '+821000000003' },
    ],
  });
  await db.store.create({
    data: { id: 'store', name: '골목카페', latitude: 37.5665, longitude: 126.978 },
  });
  await db.membership.createMany({
    data: [
      { id: 'm-owner', storeId: 'store', userId: 'owner', role: 'OWNER' },
      { id: 'm-staff', storeId: 'store', userId: 'staff', role: 'EMPLOYEE' },
    ],
  });
  await db.storeQrToken.createMany({
    data: [
      { storeId: 'store', tokenHash: hashToken(REVOKED_QR_TOKEN), revokedAt: CLOCK_IN_AT },
      { storeId: 'store', tokenHash: hashToken(QR_TOKEN) },
    ],
  });
  await db.employmentTerms.create({
    data: {
      id: 'terms',
      membershipId: 'm-staff',
      version: 1,
      effectiveFrom: new Date('2026-11-01T00:00:00+09:00'),
      hourlyWage: 10320,
      contractStartDate: new Date('2026-11-01'),
      createdById: 'owner',
    },
  });
});

afterEach(async () => {
  await close();
});

const punchInput = (overrides: Partial<Parameters<typeof punch>[1]> = {}) => ({
  userId: 'staff',
  qrToken: QR_TOKEN,
  expectedAction: 'CLOCK_IN' as const,
  location: null,
  idempotencyKey: '00000000-0000-4000-8000-000000000001',
  now: CLOCK_IN_AT,
  ...overrides,
});

const clockOutInput = (now: Date) =>
  punchInput({
    expectedAction: 'CLOCK_OUT',
    idempotencyKey: '00000000-0000-4000-8000-000000000002',
    now,
  });

describe('getPunchPreview', () => {
  it('근무 중이 아니면 출근을 제안한다', async () => {
    const preview = await getPunchPreview(db, { userId: 'staff', qrToken: QR_TOKEN, now: CLOCK_IN_AT });
    expect(preview).toMatchObject({ store: { name: '골목카페' }, nextAction: 'CLOCK_IN' });
  });

  it('근무 중이면 퇴근을 제안한다', async () => {
    await punch(db, punchInput());
    const preview = await getPunchPreview(db, {
      userId: 'staff',
      qrToken: QR_TOKEN,
      now: ONE_HOUR_LATER,
    });
    expect(preview.nextAction).toBe('CLOCK_OUT');
  });

  it('없는 QR은 QR_TOKEN_INVALID', async () => {
    const preview = getPunchPreview(db, { userId: 'staff', qrToken: 'z'.repeat(43), now: CLOCK_IN_AT });
    await expect(preview).rejects.toMatchObject({ code: 'QR_TOKEN_INVALID' });
  });

  it('폐기된 QR은 QR_TOKEN_REVOKED', async () => {
    const preview = getPunchPreview(db, {
      userId: 'staff',
      qrToken: REVOKED_QR_TOKEN,
      now: CLOCK_IN_AT,
    });
    await expect(preview).rejects.toMatchObject({ code: 'QR_TOKEN_REVOKED' });
  });

  it('매장 직원이 아니면 NOT_STORE_MEMBER', async () => {
    const preview = getPunchPreview(db, { userId: 'stranger', qrToken: QR_TOKEN, now: CLOCK_IN_AT });
    await expect(preview).rejects.toMatchObject({ code: 'NOT_STORE_MEMBER' });
  });

  it('비활성 직원은 NOT_STORE_MEMBER', async () => {
    await db.membership.update({ where: { id: 'm-staff' }, data: { status: 'INACTIVE' } });
    const preview = getPunchPreview(db, { userId: 'staff', qrToken: QR_TOKEN, now: CLOCK_IN_AT });
    await expect(preview).rejects.toMatchObject({ code: 'NOT_STORE_MEMBER' });
  });

  it('근로조건이 없으면 TERMS_NOT_SET', async () => {
    const preview = getPunchPreview(db, { userId: 'owner', qrToken: QR_TOKEN, now: CLOCK_IN_AT });
    await expect(preview).rejects.toMatchObject({ code: 'TERMS_NOT_SET' });
  });
});

describe('punch', () => {
  it('출근하면 그 시점 근로조건으로 OPEN 근태가 생긴다', async () => {
    await punch(db, punchInput());
    const attendance = await db.attendance.findFirstOrThrow();
    expect(attendance).toMatchObject({ status: 'OPEN', termsId: 'terms', clockInAt: CLOCK_IN_AT });
  });

  it('출근 위치가 매장에서 멀면 매장 밖으로 기록한다', async () => {
    await punch(
      db,
      punchInput({ location: { latitude: 37.5705, longitude: 126.978, accuracyM: 20 } }),
    );
    const attendance = await db.attendance.findFirstOrThrow();
    expect(attendance.clockInOutsideArea).toBe(true);
  });

  it('같은 키로 다시 보내면 같은 결과를 주고 근태는 1건이다', async () => {
    const first = await punch(db, punchInput());
    const retry = await punch(db, punchInput({ now: new Date(CLOCK_IN_AT.getTime() + 5000) }));
    expect([retry.attendance.id, await db.attendance.count()]).toEqual([first.attendance.id, 1]);
  });

  it('같은 키에 다른 요청이면 IDEMPOTENCY_KEY_REUSED', async () => {
    await punch(db, punchInput());
    const reused = punch(db, punchInput({ expectedAction: 'CLOCK_OUT', now: ONE_HOUR_LATER }));
    await expect(reused).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
  });

  it('만료된 키는 새 요청으로 처리한다', async () => {
    await punch(db, punchInput());
    await punch(db, clockOutInput(ONE_HOUR_LATER));
    const nextDay = new Date(CLOCK_IN_AT.getTime() + IDEMPOTENCY_TTL_MS + 1000);
    const result = await punch(db, punchInput({ now: nextDay }));
    expect(await db.attendance.count()).toBe(2);
    expect(result.action).toBe('CLOCK_IN');
  });

  it('다른 기기에서 먼저 출근했으면 PUNCH_ACTION_MISMATCH', async () => {
    await punch(db, punchInput());
    const secondDevice = punch(
      db,
      punchInput({ idempotencyKey: '00000000-0000-4000-8000-000000000009' }),
    );
    await expect(secondDevice).rejects.toMatchObject({ code: 'PUNCH_ACTION_MISMATCH' });
  });

  it('두 기기가 동시에 출근하면 1건만 성공한다', async () => {
    const results = await Promise.allSettled([
      punch(db, punchInput()),
      punch(db, punchInput({ idempotencyKey: '00000000-0000-4000-8000-000000000009' })),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual(['fulfilled', 'rejected']);
  });

  it('출근 1분 안의 퇴근은 PUNCH_TOO_SOON', async () => {
    await punch(db, punchInput());
    const tooSoon = punch(db, clockOutInput(new Date(CLOCK_IN_AT.getTime() + 30_000)));
    await expect(tooSoon).rejects.toMatchObject({ code: 'PUNCH_TOO_SOON' });
  });

  it('퇴근하면 CLOSED가 되고 퇴근 시각이 기록된다', async () => {
    await punch(db, punchInput());
    const result = await punch(db, clockOutInput(ONE_HOUR_LATER));
    expect(result.attendance).toMatchObject({
      status: 'CLOSED',
      clockOutAt: ONE_HOUR_LATER.toISOString(),
    });
  });

  it('퇴근 실패 요청은 저장되지 않아 같은 키로 다시 시도할 수 있다', async () => {
    await punch(db, punchInput());
    await punch(db, clockOutInput(new Date(CLOCK_IN_AT.getTime() + 30_000))).catch(() => undefined);
    const result = await punch(db, clockOutInput(ONE_HOUR_LATER));
    expect(result.attendance.status).toBe('CLOSED');
  });
});

describe('getCurrentAttendance', () => {
  it('근무 중인 근태를 돌려준다', async () => {
    const { attendance } = await punch(db, punchInput());
    const current = await getCurrentAttendance(db, { userId: 'staff', storeId: 'store' });
    expect(current?.id).toBe(attendance.id);
  });

  it('근무 중이 아니면 null', async () => {
    expect(await getCurrentAttendance(db, { userId: 'staff', storeId: 'store' })).toBeNull();
  });
});
