import type { PrismaClient } from '@chulgeunkok/db';
import { createTestDb } from '@chulgeunkok/db/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { hashToken } from '@/server/crypto/hash-token';

import { AUTO_MISSING_CLOCK_OUT_REASON, runMissingClockOutJob } from './missing-clock-out-job';
import { punch } from './punch-service';

const kst = (local: string) => new Date(`${local}+09:00`);

let db: PrismaClient;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  await db.user.createMany({ data: [{ id: 'owner', name: '김사장' }, { id: 'staff', name: '이알바' }] });
  await db.store.create({ data: { id: 'store', name: '골목카페' } });
  await db.membership.createMany({
    data: [
      { id: 'm-owner', storeId: 'store', userId: 'owner', role: 'OWNER' },
      { id: 'm-staff', storeId: 'store', userId: 'staff', role: 'EMPLOYEE' },
    ],
  });
  await db.employmentTerms.create({
    data: {
      id: 'terms',
      membershipId: 'm-staff',
      version: 1,
      effectiveFrom: kst('2026-10-01T00:00:00'),
      hourlyWage: 10320,
      contractStartDate: new Date('2026-10-01'),
      createdById: 'owner',
      // 월요일 18:00–23:00
      schedules: { create: [{ weekday: 1, startMinute: 18 * 60, workMinutes: 300, breakMinutes: 30 }] },
    },
  });
  await db.attendance.create({
    data: { id: 'monday', storeId: 'store', membershipId: 'm-staff', termsId: 'terms', clockInAt: kst('2026-11-02T18:00:00') },
  });
});

afterEach(async () => {
  await close();
});

const statusOf = async () => (await db.attendance.findUniqueOrThrow({ where: { id: 'monday' } })).status;

describe('runMissingClockOutJob', () => {
  it('소정 퇴근 + 4시간 전에는 그대로 둔다', async () => {
    await runMissingClockOutJob(db, kst('2026-11-03T02:59:00'));
    expect(await statusOf()).toBe('OPEN');
  });

  it('지나면 퇴근 누락으로 바꾸고 시스템 이력을 남긴다', async () => {
    const result = await runMissingClockOutJob(db, kst('2026-11-03T03:00:00'));
    const revision = await db.attendanceRevision.findFirstOrThrow({ where: { attendanceId: 'monday' } });
    expect([result.transitioned, await statusOf(), revision.actorId, revision.reason]).toEqual([
      1,
      'MISSING_CLOCK_OUT',
      'system',
      AUTO_MISSING_CLOCK_OUT_REASON,
    ]);
  });

  it('두 번 돌려도 한 번만 바꾼다', async () => {
    await runMissingClockOutJob(db, kst('2026-11-03T03:00:00'));
    const second = await runMissingClockOutJob(db, kst('2026-11-03T03:10:00'));
    expect([second.transitioned, await db.attendanceRevision.count()]).toEqual([0, 1]);
  });

  it('바뀐 뒤 QR을 찍으면 새 출근이다', async () => {
    await runMissingClockOutJob(db, kst('2026-11-03T03:00:00'));
    const token = 'q'.repeat(43);
    await db.storeQrToken.create({ data: { storeId: 'store', tokenHash: hashToken(token) } });
    const result = await punch(db, {
      userId: 'staff',
      qrToken: token,
      expectedAction: 'CLOCK_IN',
      location: null,
      idempotencyKey: '00000000-0000-4000-8000-000000000001',
      now: kst('2026-11-03T18:00:00'),
    });
    expect(result.action).toBe('CLOCK_IN');
  });
});
