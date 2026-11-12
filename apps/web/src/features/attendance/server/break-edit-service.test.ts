import type { PrismaClient } from '@chulgeunkok/db';
import { createTestDb } from '@chulgeunkok/db/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AdminReplaceBreaksBody } from '../schema';

import { replaceBreaksByAdmin } from './break-edit-service';

const kst = (local: string) => new Date(`${local}+09:00`);
const iso = (local: string) => kst(local).toISOString();
const NOW = kst('2026-11-10T12:00:00');
const HOUR = 3600;

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
      effectiveFrom: kst('2026-09-01T00:00:00'),
      hourlyWage: 10320,
      contractStartDate: new Date('2026-09-01'),
      createdById: 'owner',
      // 월요일 휴게 30분
      schedules: { create: [{ weekday: 1, startMinute: 18 * 60, workMinutes: 300, breakMinutes: 30 }] },
    },
  });
  const base = { storeId: 'store', membershipId: 'm-staff', termsId: 'terms' };
  await db.attendance.createMany({
    data: [
      // 11/2(월) 18:00–23:00
      { ...base, id: 'closed', clockInAt: kst('2026-11-02T18:00:00'), clockOutAt: kst('2026-11-02T23:00:00'), status: 'CLOSED' },
      // 11/4(수) 22:00–다음 날 03:00, 자정 넘김
      { ...base, id: 'overnight', clockInAt: kst('2026-11-04T22:00:00'), clockOutAt: kst('2026-11-05T03:00:00'), status: 'CLOSED' },
      { ...base, id: 'missing', clockInAt: kst('2026-11-09T18:00:00'), status: 'MISSING_CLOCK_OUT' },
      { ...base, id: 'open', clockInAt: kst('2026-11-10T09:00:00'), status: 'OPEN' },
      { ...base, id: 'void', clockInAt: kst('2026-11-03T18:00:00'), clockOutAt: kst('2026-11-03T20:00:00'), status: 'VOID' },
      // 10/5 — 35일 기한 밖
      { ...base, id: 'old', clockInAt: kst('2026-10-05T18:00:00'), clockOutAt: kst('2026-10-05T23:00:00'), status: 'CLOSED' },
    ],
  });
  await db.attendanceBreak.create({
    data: { attendanceId: 'closed', startAt: kst('2026-11-02T20:00:00'), endAt: kst('2026-11-02T20:05:00') },
  });
});

afterEach(async () => {
  await close();
});

const replace = (attendanceId: string, breaks: { startAt: string; endAt: string }[], actorUserId = 'owner') =>
  replaceBreaksByAdmin(db, { attendanceId, actorUserId, body: { breaks, reason: '휴게를 잘못 눌렀어요' }, now: NOW });

describe('replaceBreaksByAdmin', () => {
  it('휴게를 통째로 바꾸고 인정 시간이 바뀐 휴게대로 계산된다', async () => {
    const detail = await replace('closed', [
      { startAt: iso('2026-11-02T19:00:00'), endAt: iso('2026-11-02T19:30:00') },
      { startAt: iso('2026-11-02T21:00:00'), endAt: iso('2026-11-02T21:15:00') },
    ]);
    expect(detail.breaks.map((row) => [row.startAt, row.endAt])).toEqual([
      [iso('2026-11-02T19:00:00'), iso('2026-11-02T19:30:00')],
      [iso('2026-11-02T21:00:00'), iso('2026-11-02T21:15:00')],
    ]);
    expect([detail.breakSeconds, detail.recognizedSeconds]).toEqual([45 * 60, 5 * HOUR - 45 * 60]);
  });

  it('빈 목록이면 기록한 휴게가 없어져 소정 휴게 30분을 뺀다', async () => {
    const detail = await replace('closed', []);
    expect([detail.breaks, detail.recognizedSeconds]).toEqual([[], 4.5 * HOUR]);
  });

  it('변경 이력 before/after 에 휴게가 함께 남는다', async () => {
    const detail = await replace('closed', [{ startAt: iso('2026-11-02T19:00:00'), endAt: iso('2026-11-02T19:30:00') }]);
    expect(detail.revised).toBe(true);
    expect(detail.revisions[0]).toMatchObject({
      actorName: '김사장',
      reason: '휴게를 잘못 눌렀어요',
      before: { status: 'CLOSED', breaks: [{ startAt: iso('2026-11-02T20:00:00'), endAt: iso('2026-11-02T20:05:00') }] },
      after: { status: 'CLOSED', breaks: [{ startAt: iso('2026-11-02T19:00:00'), endAt: iso('2026-11-02T19:30:00') }] },
    });
  });

  it('자정을 넘는 근무도 근무 안이면 고칠 수 있다', async () => {
    const detail = await replace('overnight', [{ startAt: iso('2026-11-05T00:30:00'), endAt: iso('2026-11-05T01:00:00') }]);
    expect(detail.breakSeconds).toBe(30 * 60);
  });

  it('출근 전·퇴근 뒤로 나간 휴게는 VALIDATION_FAILED', async () => {
    await expect(
      replace('closed', [{ startAt: iso('2026-11-02T17:50:00'), endAt: iso('2026-11-02T18:10:00') }]),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED', message: '휴게는 출근과 퇴근 사이로 넣어 주세요.' });
    await expect(
      replace('closed', [{ startAt: iso('2026-11-02T22:50:00'), endAt: iso('2026-11-02T23:10:00') }]),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('끝이 시작보다 늦지 않으면 VALIDATION_FAILED', async () => {
    const at = iso('2026-11-02T20:00:00');
    await expect(replace('closed', [{ startAt: at, endAt: at }])).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      message: '휴게 끝이 시작보다 늦어야 해요.',
    });
  });

  it('휴게끼리 겹치면 VALIDATION_FAILED, 맞닿는 건 된다', async () => {
    await expect(
      replace('closed', [
        { startAt: iso('2026-11-02T20:10:00'), endAt: iso('2026-11-02T20:40:00') },
        { startAt: iso('2026-11-02T20:00:00'), endAt: iso('2026-11-02T20:20:00') },
      ]),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED', message: '휴게 시간이 서로 겹쳐요.' });
    const detail = await replace('closed', [
      { startAt: iso('2026-11-02T20:00:00'), endAt: iso('2026-11-02T20:20:00') },
      { startAt: iso('2026-11-02T20:20:00'), endAt: iso('2026-11-02T20:40:00') },
    ]);
    expect(detail.breakSeconds).toBe(40 * 60);
  });

  it('검증에 걸리면 기존 휴게·이력은 그대로다', async () => {
    await expect(replace('closed', [{ startAt: iso('2026-11-02T17:00:00'), endAt: iso('2026-11-02T18:30:00') }])).rejects.toThrow();
    const saved = await db.attendance.findUniqueOrThrow({ where: { id: 'closed' }, include: { breaks: true, revisions: true } });
    expect([saved.breaks.length, saved.revisions.length]).toEqual([1, 0]);
  });

  it('근무 중(OPEN) 기록은 직원 몫이라 ATTENDANCE_NOT_EDITABLE', async () => {
    await expect(replace('open', [])).rejects.toMatchObject({
      code: 'ATTENDANCE_NOT_EDITABLE',
      message: '근무 중인 기록의 휴게는 직원이 남겨요. 퇴근한 뒤에 고쳐 주세요.',
    });
  });

  it('퇴근 누락·무효 기록은 ATTENDANCE_NOT_EDITABLE', async () => {
    await expect(replace('missing', [])).rejects.toMatchObject({
      code: 'ATTENDANCE_NOT_EDITABLE',
      message: '퇴근 시각을 먼저 넣어 주세요.',
    });
    await expect(replace('void', [])).rejects.toMatchObject({ code: 'ATTENDANCE_NOT_EDITABLE' });
  });

  it('근무일이 35일 기한 밖이면 CORRECTION_WINDOW_CLOSED', async () => {
    await expect(replace('old', [])).rejects.toMatchObject({
      code: 'CORRECTION_WINDOW_CLOSED',
      message: '35일이 지난 근무는 휴게를 고칠 수 없어요.',
    });
  });

  it('직원은 고칠 수 없다 (FORBIDDEN)', async () => {
    await expect(replace('closed', [], 'staff')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('다른 매장 관리자는 근무 존재도 모른다 (NOT_FOUND)', async () => {
    await db.user.create({ data: { id: 'stranger', name: '남사장' } });
    await db.store.create({ data: { id: 'store2', name: '건너편' } });
    await db.membership.create({ data: { id: 'm-stranger', storeId: 'store2', userId: 'stranger', role: 'OWNER' } });
    await expect(replace('closed', [], 'stranger')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(replace('nope', [])).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('저장 뒤 검토 항목을 다시 계산한다 (법정 휴게보다 짧으면 BREAK_SHORTAGE)', async () => {
    await replace('closed', [{ startAt: iso('2026-11-02T20:00:00'), endAt: iso('2026-11-02T20:10:00') }]);
    const reviews = await db.laborReview.findMany({ where: { sourceId: 'closed' } });
    expect(reviews.map((review) => review.type)).toContain('BREAK_SHORTAGE');
  });

  it('사유는 필수, 휴게 수는 상한이 있다 (요청 스키마)', () => {
    const one = { startAt: iso('2026-11-02T20:00:00'), endAt: iso('2026-11-02T20:10:00') };
    expect(AdminReplaceBreaksBody.safeParse({ breaks: [], reason: '사유' }).success).toBe(true);
    expect(AdminReplaceBreaksBody.safeParse({ breaks: [one], reason: '  ' }).success).toBe(false);
    expect(AdminReplaceBreaksBody.safeParse({ breaks: Array(21).fill(one), reason: '사유' }).success).toBe(false);
  });
});
