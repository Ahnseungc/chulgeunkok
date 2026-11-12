import type { PrismaClient } from '@chulgeunkok/db';
import { createTestDb } from '@chulgeunkok/db/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { hashToken } from '@/server/crypto/hash-token';

import { updateAttendanceByAdmin } from './attendance-admin-service';
import { endBreak, startBreak } from './break-service';
import { runMissingClockOutJob } from './missing-clock-out-job';
import { punch } from './punch-service';

const kst = (local: string) => new Date(`${local}+09:00`);
const QR_TOKEN = 'a'.repeat(43);
const CLOCK_IN_AT = kst('2026-11-02T18:00:00');
const BREAK_START_AT = kst('2026-11-02T20:00:00');
const BREAK_END_AT = kst('2026-11-02T20:20:00');

let db: PrismaClient;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  await db.user.createMany({ data: [{ id: 'owner', name: '김사장' }, { id: 'staff', name: '이알바' }, { id: 'other', name: '박알바' }] });
  await db.store.createMany({ data: [{ id: 'store', name: '골목카페' }, { id: 'store-2', name: '옆가게' }] });
  await db.membership.createMany({
    data: [
      { id: 'm-owner', storeId: 'store', userId: 'owner', role: 'OWNER' },
      { id: 'm-staff', storeId: 'store', userId: 'staff', role: 'EMPLOYEE' },
      { id: 'm-other', storeId: 'store', userId: 'other', role: 'EMPLOYEE' },
    ],
  });
  await db.storeQrToken.create({ data: { storeId: 'store', tokenHash: hashToken(QR_TOKEN) } });
  await db.employmentTerms.create({
    data: {
      id: 'terms', membershipId: 'm-staff', version: 1, effectiveFrom: kst('2026-10-01T00:00:00'), hourlyWage: 10320,
      contractStartDate: new Date('2026-10-01'), createdById: 'owner',
      // 월요일 18:00–23:00
      schedules: { create: [{ weekday: 1, startMinute: 18 * 60, workMinutes: 300, breakMinutes: 30 }] },
    },
  });
  await db.attendance.create({
    data: { id: 'monday', storeId: 'store', membershipId: 'm-staff', termsId: 'terms', clockInAt: CLOCK_IN_AT },
  });
});

afterEach(async () => {
  await close();
});

const staff = (now: Date) => ({ userId: 'staff', storeId: 'store', now });
const breaksOf = () => db.attendanceBreak.findMany({ where: { attendanceId: 'monday' }, orderBy: { startAt: 'asc' } });
const errorCodeOf = (promise: Promise<unknown>) => promise.then(() => null, (error: { code?: string }) => error.code);

describe('startBreak (attendance §3.6)', () => {
  it('근무 중이면 서버 시각으로 열린 휴게를 만든다', async () => {
    const result = await startBreak(db, staff(BREAK_START_AT));
    expect(result).toMatchObject({ attendanceId: 'monday', break: { startAt: BREAK_START_AT.toISOString(), endAt: null } });
    expect(await breaksOf()).toHaveLength(1);
  });

  it('이미 휴게 중이면 그 휴게를 그대로 돌려준다 (멱등)', async () => {
    const first = await startBreak(db, staff(BREAK_START_AT));
    const again = await startBreak(db, staff(BREAK_END_AT));
    expect([again.break.id, again.break.startAt]).toEqual([first.break.id, BREAK_START_AT.toISOString()]);
    expect(await breaksOf()).toHaveLength(1);
  });

  it('근무 중이 아니면 NOT_WORKING', async () => {
    expect(await errorCodeOf(startBreak(db, { userId: 'other', storeId: 'store', now: BREAK_START_AT }))).toBe('NOT_WORKING');
  });

  it('이 매장 직원이 아니면 NOT_STORE_MEMBER', async () => {
    expect(await errorCodeOf(startBreak(db, { userId: 'staff', storeId: 'store-2', now: BREAK_START_AT }))).toBe(
      'NOT_STORE_MEMBER',
    );
  });
});

describe('endBreak (attendance §3.6)', () => {
  it('열린 휴게를 서버 시각으로 닫는다', async () => {
    await startBreak(db, staff(BREAK_START_AT));
    const result = await endBreak(db, staff(BREAK_END_AT));
    expect(result.break).toMatchObject({ startAt: BREAK_START_AT.toISOString(), endAt: BREAK_END_AT.toISOString() });
  });

  it('닫은 뒤 다시 시작하면 새 휴게가 생긴다 (근무당 여러 번)', async () => {
    await startBreak(db, staff(BREAK_START_AT));
    await endBreak(db, staff(BREAK_END_AT));
    await startBreak(db, staff(kst('2026-11-02T21:00:00')));
    expect((await breaksOf()).map((row) => row.endAt === null)).toEqual([false, true]);
  });

  it('열린 휴게가 없으면 BREAK_NOT_STARTED', async () => {
    expect(await errorCodeOf(endBreak(db, staff(BREAK_END_AT)))).toBe('BREAK_NOT_STARTED');
  });

  it('근무 중이 아니면 NOT_WORKING', async () => {
    expect(await errorCodeOf(endBreak(db, { userId: 'other', storeId: 'store', now: BREAK_END_AT }))).toBe('NOT_WORKING');
  });
});

describe('열린 휴게 자동 종료', () => {
  it('휴게 중에 퇴근을 찍으면 퇴근 시각으로 휴게를 닫는다', async () => {
    const clockOutAt = kst('2026-11-02T23:00:00');
    await startBreak(db, staff(BREAK_START_AT));
    await punch(db, {
      userId: 'staff', qrToken: QR_TOKEN, expectedAction: 'CLOCK_OUT', location: null,
      idempotencyKey: '00000000-0000-4000-8000-000000000002', now: clockOutAt,
    });
    expect((await breaksOf()).map((row) => row.endAt)).toEqual([clockOutAt]);
  });

  it('퇴근 누락으로 바뀌면 전환 시각으로 휴게를 닫는다', async () => {
    const transitionAt = kst('2026-11-03T03:00:00');
    await startBreak(db, staff(BREAK_START_AT));
    await runMissingClockOutJob(db, transitionAt);
    expect((await breaksOf()).map((row) => row.endAt)).toEqual([transitionAt]);
  });

  it('관리자가 근무 중 기록에 퇴근을 넣으면 그 시각으로 닫고, 휴게 시작보다 이르면 시작 시각으로 닫는다', async () => {
    await startBreak(db, staff(BREAK_START_AT));
    await updateAttendanceByAdmin(db, {
      attendanceId: 'monday', actorUserId: 'owner', now: kst('2026-11-02T23:30:00'),
      change: { clockOutAt: kst('2026-11-02T19:30:00').toISOString(), reason: '일찍 퇴근' },
    });
    expect((await breaksOf()).map((row) => row.endAt)).toEqual([BREAK_START_AT]);
  });
});
