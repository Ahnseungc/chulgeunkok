import type { PrismaClient } from '@chulgeunkok/db';
import { createTestDb } from '@chulgeunkok/db/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createCorrectionRequest } from './correction-service';
import { getMyAttendances } from './my-attendance-service';

const kst = (local: string) => new Date(`${local}+09:00`);
const NOW = kst('2026-11-10T19:00:00');

let db: PrismaClient;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  await db.user.createMany({
    data: [
      { id: 'owner', name: '김사장', phone: '+821000000001' },
      { id: 'staff', name: '이알바' },
      { id: 'other', name: '박신입' },
    ],
  });
  await db.store.create({ data: { id: 'store', name: '골목카페' } });
  await db.membership.createMany({
    data: [
      { id: 'm-owner', storeId: 'store', userId: 'owner', role: 'OWNER' },
      { id: 'm-staff', storeId: 'store', userId: 'staff', role: 'EMPLOYEE' },
      { id: 'm-other', storeId: 'store', userId: 'other', role: 'EMPLOYEE' },
    ],
  });
  for (const memberId of ['m-staff', 'm-other']) {
    await db.employmentTerms.create({
      data: {
        id: `terms-${memberId}`,
        membershipId: memberId,
        version: 1,
        effectiveFrom: kst('2026-10-01T00:00:00'),
        hourlyWage: 10320,
        contractStartDate: new Date('2026-10-01'),
        createdById: 'owner',
      },
    });
  }
  await db.attendance.createMany({
    data: [
      { id: 'a1', storeId: 'store', membershipId: 'm-staff', termsId: 'terms-m-staff', clockInAt: kst('2026-11-02T18:00:00'), clockOutAt: kst('2026-11-02T21:00:00'), status: 'CLOSED' },
      { id: 'a2', storeId: 'store', membershipId: 'm-staff', termsId: 'terms-m-staff', clockInAt: kst('2026-11-10T18:00:00'), status: 'OPEN' },
      { id: 'b1', storeId: 'store', membershipId: 'm-other', termsId: 'terms-m-other', clockInAt: kst('2026-11-03T18:00:00'), clockOutAt: kst('2026-11-03T22:00:00'), status: 'CLOSED' },
    ],
  });
});

afterEach(async () => {
  await close();
});

const mine = () => getMyAttendances(db, { userId: 'staff', storeId: 'store', now: NOW });

describe('getMyAttendances', () => {
  it('내 기록만, 근무 중 카드와 이번 기간 예상 기본급을 보여 준다', async () => {
    const result = await mine();
    expect([
      result.rows.map((row) => row.id),
      result.working?.attendanceId,
      result.summary.basePayEstimate,
      result.summary.workDays,
      result.summary.allowances.total,
    ]).toEqual([['a2', 'a1'], 'a2', 30960, 1, 0]);
  });

  it('대기 중인 수정 요청을 근무 옆에 표시한다', async () => {
    await createCorrectionRequest(db, {
      attendanceId: 'a1',
      actorUserId: 'staff',
      body: { type: 'BREAK_WAIVED', reason: '못 쉼' },
      now: NOW,
    });
    expect((await mine()).rows.find((row) => row.id === 'a1')?.pendingCorrection).toBe('BREAK_WAIVED');
  });

  it('소속이 아닌 매장은 NOT_FOUND', async () => {
    await db.store.create({ data: { id: 'store2', name: '옆집' } });
    await expect(getMyAttendances(db, { userId: 'staff', storeId: 'store2', now: NOW })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
