import type { PrismaClient } from '@chulgeunkok/db';
import { createTestDb } from '@chulgeunkok/db/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getAttendanceDetail, listStoreAttendances, updateAttendanceByAdmin } from './attendance-admin-service';

const kst = (local: string) => new Date(`${local}+09:00`);
const NOW = kst('2026-11-10T12:00:00');
const HOUR = 3600;

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
        // 월요일 휴게 30분
        schedules: { create: [{ weekday: 1, startMinute: 18 * 60, workMinutes: 300, breakMinutes: 30 }] },
      },
    });
  }
  await db.attendance.createMany({
    data: [
      // 11/2(월) 정상 근무 5시간 → 인정 4.5시간
      { id: 'closed', storeId: 'store', membershipId: 'm-staff', termsId: 'terms-m-staff', clockInAt: kst('2026-11-02T18:00:00'), clockOutAt: kst('2026-11-02T23:00:00'), status: 'CLOSED' },
      // 11/9(월) 퇴근 누락
      { id: 'missing', storeId: 'store', membershipId: 'm-staff', termsId: 'terms-m-staff', clockInAt: kst('2026-11-09T18:00:00'), status: 'MISSING_CLOCK_OUT' },
      // 10/30 — 지난 기간
      { id: 'october', storeId: 'store', membershipId: 'm-other', termsId: 'terms-m-other', clockInAt: kst('2026-10-30T18:00:00'), clockOutAt: kst('2026-10-30T20:00:00'), status: 'CLOSED' },
    ],
  });
});

afterEach(async () => {
  await close();
});

const list = (overrides: Partial<Parameters<typeof listStoreAttendances>[1]> = {}) =>
  listStoreAttendances(db, { storeId: 'store', actorUserId: 'owner', now: NOW, ...overrides });

const edit = (attendanceId: string, change: Parameters<typeof updateAttendanceByAdmin>[1]['change']) =>
  updateAttendanceByAdmin(db, { attendanceId, actorUserId: 'owner', change, now: NOW });

describe('listStoreAttendances', () => {
  it('이번 정산 기간 근태만 최신순으로, 인정 시간과 함께 보여 준다', async () => {
    const { period, rows } = await list();
    expect([period.start, period.prevStart, period.nextStart]).toEqual(['2026-11-01', '2026-10-01', null]);
    expect(rows.map((row) => [row.id, row.recognizedSeconds])).toEqual([
      ['missing', 0],
      ['closed', 4.5 * HOUR],
    ]);
  });

  it('지난 기간을 고를 수 있다', async () => {
    const { rows } = await list({ periodStart: '2026-10-01' });
    expect(rows.map((row) => row.id)).toEqual(['october']);
  });

  it('기간 시작일이 아닌 날짜는 PAY_PERIOD_INVALID', async () => {
    await expect(list({ periodStart: '2026-11-03' })).rejects.toMatchObject({ code: 'PAY_PERIOD_INVALID' });
  });

  it('상태로 거를 수 있다', async () => {
    const { rows } = await list({ status: 'MISSING_CLOCK_OUT' });
    expect(rows.map((row) => row.id)).toEqual(['missing']);
  });

  it('직원은 볼 수 없다', async () => {
    await expect(list({ actorUserId: 'staff' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('updateAttendanceByAdmin', () => {
  it('퇴근 누락에 퇴근 시각을 넣으면 CLOSED가 되고 이력이 남는다', async () => {
    const detail = await edit('missing', { clockOutAt: kst('2026-11-09T23:00:00').toISOString(), reason: '퇴근 찍는 걸 잊음' });
    expect([detail.status, detail.recognizedSeconds, detail.revised, detail.revisions[0]?.before?.status]).toEqual([
      'CLOSED',
      4.5 * HOUR,
      true,
      'MISSING_CLOCK_OUT',
    ]);
  });

  it('휴게 못 함을 승인하면 휴게를 빼지 않는다', async () => {
    const detail = await edit('closed', { breakWaived: true, reason: '바빠서 못 쉼' });
    expect(detail.recognizedSeconds).toBe(5 * HOUR);
  });

  it('퇴근이 출근보다 이르면 VALIDATION_FAILED', async () => {
    await expect(
      edit('closed', { clockOutAt: kst('2026-11-02T17:00:00').toISOString(), reason: '실수' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('미래 시각은 넣을 수 없다', async () => {
    await expect(
      edit('missing', { clockOutAt: kst('2026-11-10T13:00:00').toISOString(), reason: '미리' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('같은 직원의 다른 근무와 겹치면 ATTENDANCE_CONFLICT', async () => {
    await expect(
      edit('missing', { clockInAt: kst('2026-11-02T22:00:00').toISOString(), clockOutAt: kst('2026-11-03T01:00:00').toISOString(), reason: '겹침' }),
    ).rejects.toMatchObject({ code: 'ATTENDANCE_CONFLICT' });
  });

  it('퇴근 누락 기록이 있어도 같은 직원의 다른 근무를 고칠 수 있다', async () => {
    const detail = await edit('closed', { clockOutAt: kst('2026-11-02T22:00:00').toISOString(), reason: '일찍 퇴근' });
    expect(detail.clockOutAt).toBe(kst('2026-11-02T22:00:00').toISOString());
  });

  it('무효 처리하면 정산에서 빠지고 다시 고칠 수 없다', async () => {
    await edit('closed', { status: 'VOID', reason: '잘못 찍음' });
    const { rows } = await list();
    expect(rows.find((row) => row.id === 'closed')?.recognizedSeconds).toBe(0);
    await expect(edit('closed', { breakWaived: true, reason: '다시' })).rejects.toMatchObject({
      code: 'ATTENDANCE_NOT_EDITABLE',
    });
  });

  it('직원은 고칠 수 없다', async () => {
    await expect(
      updateAttendanceByAdmin(db, { attendanceId: 'closed', actorUserId: 'staff', change: { breakWaived: true, reason: '셀프' }, now: NOW }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('getAttendanceDetail', () => {
  it('직원은 관리자 상세를 볼 수 없다', async () => {
    await expect(getAttendanceDetail(db, { attendanceId: 'closed', actorUserId: 'staff', now: NOW })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});
