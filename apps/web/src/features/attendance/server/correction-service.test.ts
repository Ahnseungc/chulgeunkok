import type { PrismaClient } from '@chulgeunkok/db';
import { createTestDb } from '@chulgeunkok/db/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getAttendanceDetail } from './attendance-admin-service';
import {
  approveCorrectionRequest,
  cancelCorrectionRequest,
  createCorrectionRequest,
  listStoreCorrections,
  rejectCorrectionRequest,
} from './correction-service';

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
  await db.employmentTerms.create({
    data: {
      id: 'terms',
      membershipId: 'm-staff',
      version: 1,
      effectiveFrom: kst('2026-09-01T00:00:00'),
      hourlyWage: 10320,
      contractStartDate: new Date('2026-09-01'),
      createdById: 'owner',
      schedules: { create: [{ weekday: 1, startMinute: 18 * 60, workMinutes: 300, breakMinutes: 30 }] },
    },
  });
  await db.attendance.createMany({
    data: [
      { id: 'closed', storeId: 'store', membershipId: 'm-staff', termsId: 'terms', clockInAt: kst('2026-11-09T18:00:00'), clockOutAt: kst('2026-11-09T23:00:00'), status: 'CLOSED' },
      { id: 'missing', storeId: 'store', membershipId: 'm-staff', termsId: 'terms', clockInAt: kst('2026-11-02T18:00:00'), status: 'MISSING_CLOCK_OUT' },
      { id: 'old', storeId: 'store', membershipId: 'm-staff', termsId: 'terms', clockInAt: kst('2026-10-05T18:00:00'), clockOutAt: kst('2026-10-05T23:00:00'), status: 'CLOSED' },
    ],
  });
});

afterEach(async () => {
  await close();
});

const request = (attendanceId: string, body: Parameters<typeof createCorrectionRequest>[1]['body'], actorUserId = 'staff') =>
  createCorrectionRequest(db, { attendanceId, actorUserId, body, now: NOW });

const approve = (requestId: string, override = {}) =>
  approveCorrectionRequest(db, { requestId, actorUserId: 'owner', override, now: NOW });

const recognizedOf = async (attendanceId: string) =>
  (await getAttendanceDetail(db, { attendanceId, actorUserId: 'owner', now: NOW })).recognizedSeconds;

describe('createCorrectionRequest', () => {
  it('남의 근태에는 요청할 수 없다 (존재도 숨긴다)', async () => {
    await expect(request('closed', { type: 'BREAK_WAIVED', reason: '못 쉼' }, 'other')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('휴게를 직접 남긴 근무는 휴게 못 함을 신청할 수 없다 (attendance §3.6)', async () => {
    await db.attendanceBreak.create({
      data: { attendanceId: 'closed', startAt: kst('2026-11-09T20:00:00'), endAt: kst('2026-11-09T20:20:00') },
    });
    await expect(request('closed', { type: 'BREAK_WAIVED', reason: '못 쉼' })).rejects.toMatchObject({ code: 'BREAK_ALREADY_RECORDED' });
  });

  it('1분 미만 휴게(잘못 누름)만 있으면 휴게 못 함을 신청할 수 있다 (payroll §3.2)', async () => {
    await db.attendanceBreak.create({
      data: { attendanceId: 'closed', startAt: kst('2026-11-09T20:00:00'), endAt: kst('2026-11-09T20:00:30') },
    });
    await expect(request('closed', { type: 'BREAK_WAIVED', reason: '못 쉼' })).resolves.toMatchObject({ type: 'BREAK_WAIVED' });
  });

  it('같은 근태에 대기 중 요청은 하나만', async () => {
    await request('closed', { type: 'BREAK_WAIVED', reason: '못 쉼' });
    await expect(
      request('closed', { type: 'TIME', proposedClockOutAt: kst('2026-11-09T22:00:00').toISOString(), reason: '일찍' }),
    ).rejects.toMatchObject({ code: 'CORRECTION_PENDING_EXISTS' });
  });

  it('퇴근 누락 요청은 퇴근 누락 근태에만', async () => {
    await expect(
      request('closed', { type: 'MISSING_CLOCK_OUT', proposedClockOutAt: kst('2026-11-09T23:30:00').toISOString(), reason: '잊음' }),
    ).rejects.toMatchObject({ code: 'ATTENDANCE_NOT_EDITABLE' });
  });

  it('퇴근이 출근보다 이르면 VALIDATION_FAILED', async () => {
    await expect(
      request('missing', { type: 'MISSING_CLOCK_OUT', proposedClockOutAt: kst('2026-11-02T17:00:00').toISOString(), reason: '잊음' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('35일이 지난 근무는 CORRECTION_WINDOW_CLOSED', async () => {
    await expect(request('old', { type: 'BREAK_WAIVED', reason: '못 쉼' })).rejects.toMatchObject({ code: 'CORRECTION_WINDOW_CLOSED' });
  });
});

describe('승인·반려·취소', () => {
  it('휴게 못 함을 승인하면 휴게를 빼지 않는다', async () => {
    const created = await request('closed', { type: 'BREAK_WAIVED', reason: '손님이 많아 못 쉼' });
    const approved = await approve(created.id);
    expect([approved.status, await recognizedOf('closed')]).toEqual(['APPROVED', 5 * HOUR]);
  });

  it('퇴근 누락 승인은 CLOSED로 만들고 이력에 요청이 연결된다', async () => {
    const created = await request('missing', {
      type: 'MISSING_CLOCK_OUT',
      proposedClockOutAt: kst('2026-11-02T23:00:00').toISOString(),
      reason: '퇴근 찍는 걸 잊음',
    });
    await approve(created.id);
    const revision = await db.attendanceRevision.findFirstOrThrow({ where: { attendanceId: 'missing' } });
    expect([await recognizedOf('missing'), revision.correctionRequestId]).toEqual([4.5 * HOUR, created.id]);
  });

  it('사장님이 시각을 고쳐서 승인할 수 있다', async () => {
    const created = await request('missing', {
      type: 'MISSING_CLOCK_OUT',
      proposedClockOutAt: kst('2026-11-03T01:00:00').toISOString(),
      reason: '늦게까지 일함',
    });
    await approve(created.id, { clockOutAt: kst('2026-11-02T23:00:00').toISOString(), decisionNote: '마감은 23시' });
    expect(await recognizedOf('missing')).toBe(4.5 * HOUR);
  });

  it('반려하면 근태는 그대로다', async () => {
    const created = await request('closed', { type: 'BREAK_WAIVED', reason: '못 쉼' });
    const rejected = await rejectCorrectionRequest(db, { requestId: created.id, actorUserId: 'owner', decisionNote: 'CCTV 확인 결과 휴게함', now: NOW });
    expect([rejected.status, await recognizedOf('closed')]).toEqual(['REJECTED', 4.5 * HOUR]);
  });

  it('취소한 요청은 승인할 수 없다', async () => {
    const created = await request('closed', { type: 'BREAK_WAIVED', reason: '못 쉼' });
    await cancelCorrectionRequest(db, { requestId: created.id, actorUserId: 'staff', now: NOW });
    await expect(approve(created.id)).rejects.toMatchObject({ code: 'ATTENDANCE_NOT_EDITABLE' });
  });

  it('직원은 승인할 수 없다', async () => {
    const created = await request('closed', { type: 'BREAK_WAIVED', reason: '못 쉼' });
    await expect(
      approveCorrectionRequest(db, { requestId: created.id, actorUserId: 'staff', override: {}, now: NOW }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('대기 중 목록은 오래된 순이다', async () => {
    const first = await request('closed', { type: 'BREAK_WAIVED', reason: '1' });
    const second = await request('missing', {
      type: 'MISSING_CLOCK_OUT',
      proposedClockOutAt: kst('2026-11-02T23:00:00').toISOString(),
      reason: '2',
    });
    const pending = await listStoreCorrections(db, { storeId: 'store', actorUserId: 'owner', status: 'PENDING' });
    expect(pending.map((row) => row.id)).toEqual([first.id, second.id]);
  });
});
