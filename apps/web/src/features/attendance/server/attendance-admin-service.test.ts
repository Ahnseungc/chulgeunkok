import type { PrismaClient } from '@chulgeunkok/db';
import { createTestDb } from '@chulgeunkok/db/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AdminCreateAttendanceBody } from '../schema';

import {
  applyAttendanceChange,
  createAttendanceByAdmin,
  getAttendanceDetail,
  listStoreAttendances,
  updateAttendanceByAdmin,
} from './attendance-admin-service';

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

  it('밖에서 읽은 뒤 직원이 퇴근하면 잠금 뒤 다시 읽어 퇴근을 지우지 않는다', async () => {
    await db.attendance.create({
      data: { id: 'open', storeId: 'store', membershipId: 'm-other', termsId: 'terms-m-other', clockInAt: kst('2026-11-10T08:00:00'), status: 'OPEN' },
    });
    const stale = await db.attendance.findUniqueOrThrow({ where: { id: 'open' } });
    // 관리자 트랜잭션 전에 직원 퇴근이 먼저 커밋됐다
    await db.attendance.update({ where: { id: 'open' }, data: { clockOutAt: kst('2026-11-10T11:00:00'), status: 'CLOSED' } });

    await db.$transaction((tx) =>
      applyAttendanceChange(tx, {
        current: stale,
        change: { clockInAt: kst('2026-11-10T08:30:00').toISOString(), reason: '출근 늦게 찍음' },
        actorUserId: 'owner',
        now: NOW,
      }),
    );

    const saved = await db.attendance.findUniqueOrThrow({ where: { id: 'open' }, include: { revisions: true } });
    expect([saved.status, saved.clockOutAt?.toISOString()]).toEqual(['CLOSED', kst('2026-11-10T11:00:00').toISOString()]);
    expect(saved.revisions[0]?.before).toMatchObject({ status: 'CLOSED', clockOutAt: kst('2026-11-10T11:00:00').toISOString() });
  });
});

const create = (body: Partial<Parameters<typeof createAttendanceByAdmin>[1]['body']> = {}, actorUserId = 'owner') =>
  createAttendanceByAdmin(db, {
    storeId: 'store',
    actorUserId,
    body: {
      memberId: 'm-staff',
      clockInAt: kst('2026-11-03T18:00:00').toISOString(),
      clockOutAt: kst('2026-11-03T21:00:00').toISOString(),
      breakWaived: false,
      reason: 'QR을 못 찍음',
      ...body,
    },
    now: NOW,
  });

describe('createAttendanceByAdmin', () => {
  it('CLOSED 근태와 before = null 변경 이력을 만들고 목록에 잡힌다', async () => {
    const detail = await create();
    expect([detail.status, detail.revised]).toEqual(['CLOSED', true]);
    expect(detail.revisions).toHaveLength(1);
    expect(detail.revisions[0]).toMatchObject({
      actorName: '김사장',
      reason: 'QR을 못 찍음',
      before: null,
      after: { status: 'CLOSED', clockInAt: kst('2026-11-03T18:00:00').toISOString(), breakWaived: false },
    });
    const { rows } = await list();
    expect(rows.find((row) => row.id === detail.id)?.workedSeconds).toBe(3 * HOUR);
  });

  it('출근 시각에 유효한 근로조건 버전으로 잇는다', async () => {
    const detail = await create();
    const saved = await db.attendance.findUniqueOrThrow({ where: { id: detail.id } });
    expect([saved.termsId, saved.clockInOutsideArea]).toEqual(['terms-m-staff', null]);
  });

  it('휴게 못 함으로 만들 수 있다', async () => {
    const detail = await create({ breakWaived: true });
    expect(detail.breakWaived).toBe(true);
  });

  it('같은 직원의 다른 근무와 겹치면 ATTENDANCE_CONFLICT', async () => {
    await expect(
      create({ clockInAt: kst('2026-11-02T22:00:00').toISOString(), clockOutAt: kst('2026-11-03T01:00:00').toISOString() }),
    ).rejects.toMatchObject({ code: 'ATTENDANCE_CONFLICT' });
  });

  it('근무 중(OPEN)인 기록 이후로는 만들 수 없다', async () => {
    await db.attendance.create({
      data: { id: 'open', storeId: 'store', membershipId: 'm-other', termsId: 'terms-m-other', clockInAt: kst('2026-11-10T09:00:00'), status: 'OPEN' },
    });
    await expect(
      create({ memberId: 'm-other', clockInAt: kst('2026-11-10T10:00:00').toISOString(), clockOutAt: kst('2026-11-10T11:00:00').toISOString() }),
    ).rejects.toMatchObject({ code: 'ATTENDANCE_CONFLICT' });
  });

  it('근무일이 35일 기한 밖이면 CORRECTION_WINDOW_CLOSED', async () => {
    await expect(
      create({ clockInAt: kst('2026-10-05T18:00:00').toISOString(), clockOutAt: kst('2026-10-05T21:00:00').toISOString() }),
    ).rejects.toMatchObject({ code: 'CORRECTION_WINDOW_CLOSED', message: '35일이 지난 날짜에는 근무를 추가할 수 없어요.' });
  });

  it('35일째 되는 날은 만들 수 있다', async () => {
    const detail = await create({ clockInAt: kst('2026-10-06T18:00:00').toISOString(), clockOutAt: kst('2026-10-06T21:00:00').toISOString() });
    expect(detail.localDate).toBe('2026-10-06');
  });

  it('그 시각에 근로조건이 없으면 TERMS_NOT_SET', async () => {
    await expect(create({ memberId: 'm-owner' })).rejects.toMatchObject({
      code: 'TERMS_NOT_SET',
      message: '그날 적용되는 근로조건이 없어요. 근로조건을 먼저 등록해 주세요.',
    });
  });

  it('아직 오지 않은 퇴근 시각은 VALIDATION_FAILED', async () => {
    await expect(
      create({ clockInAt: kst('2026-11-10T09:00:00').toISOString(), clockOutAt: kst('2026-11-10T13:00:00').toISOString() }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('퇴근이 출근보다 이르거나 같으면 VALIDATION_FAILED', async () => {
    const clockInAt = kst('2026-11-03T18:00:00').toISOString();
    await expect(create({ clockInAt, clockOutAt: clockInAt })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(create({ clockOutAt: kst('2026-11-03T17:00:00').toISOString() })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });

  it('사유·퇴근 시각은 필수 (요청 스키마)', () => {
    const body = { memberId: 'm-staff', clockInAt: kst('2026-11-03T18:00:00').toISOString(), clockOutAt: kst('2026-11-03T21:00:00').toISOString() };
    expect(AdminCreateAttendanceBody.safeParse({ ...body, reason: '사유' }).success).toBe(true);
    expect(AdminCreateAttendanceBody.safeParse({ ...body, reason: '  ' }).success).toBe(false);
    expect(AdminCreateAttendanceBody.safeParse({ ...body, clockOutAt: undefined, reason: '사유' }).success).toBe(false);
  });

  it('직원은 만들 수 없다', async () => {
    await expect(create({}, 'staff')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('다른 매장 관리자는 매장 존재도 모른다 (NOT_FOUND)', async () => {
    await db.user.create({ data: { id: 'stranger', name: '남사장' } });
    await db.store.create({ data: { id: 'store2', name: '건너편' } });
    await db.membership.create({ data: { id: 'm-stranger', storeId: 'store2', userId: 'stranger', role: 'OWNER' } });
    await expect(create({}, 'stranger')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('다른 매장 직원으로는 만들 수 없다 (NOT_FOUND)', async () => {
    await db.user.create({ data: { id: 'stranger', name: '남알바' } });
    await db.store.create({ data: { id: 'store2', name: '건너편' } });
    await db.membership.create({ data: { id: 'm-stranger', storeId: 'store2', userId: 'stranger', role: 'EMPLOYEE' } });
    await expect(create({ memberId: 'm-stranger' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('저장 뒤 검토 항목을 다시 계산한다 (22시 넘은 근무 → 야간 안내)', async () => {
    const detail = await create({ clockInAt: kst('2026-11-03T21:00:00').toISOString(), clockOutAt: kst('2026-11-03T23:30:00').toISOString() });
    const reviews = await db.laborReview.findMany({ where: { sourceId: detail.id } });
    expect(reviews.map((review) => review.type)).toContain('NIGHT_WORK');
  });
});

describe('getAttendanceDetail', () => {
  it('직원은 자기 기록 상세를 볼 수 있다', async () => {
    const detail = await getAttendanceDetail(db, { attendanceId: 'closed', actorUserId: 'staff', now: NOW });
    expect(detail.recognizedSeconds).toBe(4.5 * HOUR);
  });

  it('직원이 남긴 휴게를 시각 순으로 보여 주고, 기록한 휴게만큼 뺀다 (§3.6)', async () => {
    await db.attendanceBreak.createMany({
      data: [
        { attendanceId: 'closed', startAt: kst('2026-11-02T21:00:00'), endAt: kst('2026-11-02T21:05:00') },
        { attendanceId: 'closed', startAt: kst('2026-11-02T20:00:00'), endAt: kst('2026-11-02T20:20:00') },
      ],
    });
    const detail = await getAttendanceDetail(db, { attendanceId: 'closed', actorUserId: 'owner', now: NOW });
    expect([detail.breaks.map((row) => row.startAt), detail.breakSeconds, detail.recognizedSeconds]).toEqual([
      [kst('2026-11-02T20:00:00').toISOString(), kst('2026-11-02T21:00:00').toISOString()],
      25 * 60,
      5 * HOUR - 25 * 60,
    ]);
  });

  it('직원은 다른 사람 기록을 볼 수 없다', async () => {
    await expect(getAttendanceDetail(db, { attendanceId: 'october', actorUserId: 'staff', now: NOW })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});
