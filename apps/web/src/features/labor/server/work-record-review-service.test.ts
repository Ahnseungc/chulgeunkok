import type { PrismaClient } from '@chulgeunkok/db';
import { createTestDb } from '@chulgeunkok/db/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { evaluateAttendanceReviews, runDailyReviewJob } from './work-record-review-service';

const kst = (local: string) => new Date(`${local}+09:00`);
const NOW = kst('2026-11-10T06:00:00');

let db: PrismaClient;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  await db.user.createMany({ data: [{ id: 'owner', name: '김사장' }, { id: 'part', name: '이알바' }, { id: 'full', name: '최정규' }] });
  await db.store.create({ data: { id: 'store', name: '골목카페' } });
  await db.membership.createMany({
    data: [
      { id: 'm-owner', storeId: 'store', userId: 'owner', role: 'OWNER' },
      { id: 'm-part', storeId: 'store', userId: 'part', role: 'EMPLOYEE' },
      { id: 'm-full', storeId: 'store', userId: 'full', role: 'EMPLOYEE' },
    ],
  });
  // 단시간: 월·수 18:00–23:00 휴게 30분 (소정 4.5시간) / 통상: 월~금 09:00–18:00 휴게 60분 (8시간)
  await db.employmentTerms.create({
    data: {
      id: 'terms-part', membershipId: 'm-part', version: 1, effectiveFrom: kst('2026-10-01T00:00:00'), hourlyWage: 10320,
      contractStartDate: new Date('2026-10-01'), createdById: 'owner',
      schedules: { create: [1, 3].map((weekday) => ({ weekday, startMinute: 18 * 60, workMinutes: 300, breakMinutes: 30 })) },
    },
  });
  await db.employmentTerms.create({
    data: {
      id: 'terms-full', membershipId: 'm-full', version: 1, effectiveFrom: kst('2026-10-01T00:00:00'), hourlyWage: 11000,
      contractStartDate: new Date('2026-10-01'), createdById: 'owner',
      schedules: { create: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startMinute: 9 * 60, workMinutes: 540, breakMinutes: 60 })) },
    },
  });
});

afterEach(async () => {
  await close();
});

const work = (id: string, memberId: 'm-part' | 'm-full', clockIn: string, clockOut: string) =>
  db.attendance.create({
    data: { id, storeId: 'store', membershipId: memberId, termsId: memberId === 'm-part' ? 'terms-part' : 'terms-full', clockInAt: kst(clockIn), clockOutAt: kst(clockOut), status: 'CLOSED' },
  });

const reviewsOf = (sourceId: string) =>
  db.laborReview.findMany({ where: { sourceId }, orderBy: { type: 'asc' } }).then((rows) => rows.map((row) => [row.type, row.status, row.reasonCode]));

describe('evaluateAttendanceReviews', () => {
  it('22시 넘어 일하면 야간 안내, 단시간근로자가 소정보다 오래 일하면 연장 안내', async () => {
    await work('late', 'm-part', '2026-11-09T18:00:00', '2026-11-10T00:30:00');
    await evaluateAttendanceReviews(db, { attendanceId: 'late', now: NOW });
    expect(await reviewsOf('late')).toEqual([
      ['NIGHT_WORK', 'OPEN', 'NIGHT:2026-11-09'],
      ['OVERTIME', 'OPEN', 'SHORT_TIME_DAILY:2026-11-09'],
    ]);
  });

  it('소정대로 일하면 안내가 없다', async () => {
    await work('normal', 'm-full', '2026-11-09T09:00:00', '2026-11-09T18:00:00');
    await evaluateAttendanceReviews(db, { attendanceId: 'normal', now: NOW });
    expect(await reviewsOf('normal')).toEqual([]);
  });

  it('통상근로자가 주 40시간을 넘기면 그 근무에 연장 안내', async () => {
    for (const [index, day] of ['02', '03', '04', '05', '06'].entries()) {
      await work(`d${index}`, 'm-full', `2026-11-${day}T09:00:00`, `2026-11-${day}T18:00:00`);
    }
    await work('saturday', 'm-full', '2026-11-07T10:00:00', '2026-11-07T12:00:00');
    await evaluateAttendanceReviews(db, { attendanceId: 'saturday', now: NOW });
    expect(await reviewsOf('saturday')).toEqual([['OVERTIME', 'OPEN', 'WEEKLY_OVER_40H:2026-11-07']]);
  });

  it('근무를 고쳐 조건이 사라지면 해소한다', async () => {
    await work('late', 'm-part', '2026-11-09T18:00:00', '2026-11-10T00:30:00');
    await evaluateAttendanceReviews(db, { attendanceId: 'late', now: NOW });
    await db.attendance.update({ where: { id: 'late' }, data: { clockOutAt: kst('2026-11-09T21:00:00') } });
    await evaluateAttendanceReviews(db, { attendanceId: 'late', now: NOW });
    expect((await reviewsOf('late')).map((row) => row[1])).toEqual(['RESOLVED', 'RESOLVED']);
  });

  it('여러 번 평가해도 안내는 한 번만 만든다', async () => {
    await work('late', 'm-part', '2026-11-09T18:00:00', '2026-11-10T00:30:00');
    await evaluateAttendanceReviews(db, { attendanceId: 'late', now: NOW });
    await evaluateAttendanceReviews(db, { attendanceId: 'late', now: NOW });
    expect(await db.laborReview.count({ where: { sourceId: 'late' } })).toBe(2);
  });
});

describe('evaluateAttendanceReviews — 기록한 휴게 (labor §5)', () => {
  const recordBreak = (attendanceId: string, start: string, end: string) =>
    db.attendanceBreak.create({ data: { attendanceId, startAt: kst(start), endAt: kst(end) } });

  it('기록한 휴게가 법정보다 짧으면 그 근무에 휴게 부족 안내', async () => {
    await work('short-break', 'm-full', '2026-11-09T09:00:00', '2026-11-09T14:00:00');
    await recordBreak('short-break', '2026-11-09T12:00:00', '2026-11-09T12:20:00');
    await evaluateAttendanceReviews(db, { attendanceId: 'short-break', now: NOW });
    expect(await reviewsOf('short-break')).toEqual([['BREAK_SHORTAGE', 'OPEN', 'RECORDED:2026-11-09']]);
  });

  it('휴게를 기록하지 않은 근무는 근무 기록으로 휴게 부족을 판단하지 않는다 (근로조건 검토가 맡는다)', async () => {
    await work('no-record', 'm-full', '2026-11-09T09:00:00', '2026-11-09T14:00:00');
    await evaluateAttendanceReviews(db, { attendanceId: 'no-record', now: NOW });
    expect(await reviewsOf('no-record')).toEqual([]);
  });

  it('기록한 휴게로 인정 시간을 계산해 연장 안내를 판단한다', async () => {
    // 소정 휴게 60분이면 8시간이지만, 실제 30분만 쉬어 8시간 30분
    await work('full-day', 'm-full', '2026-11-09T09:00:00', '2026-11-09T18:00:00');
    await recordBreak('full-day', '2026-11-09T12:00:00', '2026-11-09T12:30:00');
    await evaluateAttendanceReviews(db, { attendanceId: 'full-day', now: NOW });
    expect(await reviewsOf('full-day')).toEqual([
      ['BREAK_SHORTAGE', 'OPEN', 'RECORDED:2026-11-09'],
      ['OVERTIME', 'OPEN', 'DAILY_OVER_8H:2026-11-09'],
    ]);
  });

  it('충분히 쉬도록 고치면 휴게 부족 안내를 해소한다', async () => {
    await work('short-break', 'm-full', '2026-11-09T09:00:00', '2026-11-09T14:00:00');
    const recorded = await recordBreak('short-break', '2026-11-09T12:00:00', '2026-11-09T12:20:00');
    await evaluateAttendanceReviews(db, { attendanceId: 'short-break', now: NOW });
    await db.attendanceBreak.update({ where: { id: recorded.id }, data: { endAt: kst('2026-11-09T12:30:00') } });
    await evaluateAttendanceReviews(db, { attendanceId: 'short-break', now: NOW });
    expect(await reviewsOf('short-break')).toEqual([['BREAK_SHORTAGE', 'RESOLVED', 'RECORDED:2026-11-09']]);
  });
});

describe('runDailyReviewJob', () => {
  it('어제(월)가 근무일인데 기록이 없으면 결근 의심, 출근했으면 없음', async () => {
    await work('full-monday', 'm-full', '2026-11-09T09:00:00', '2026-11-09T18:00:00');
    const result = await runDailyReviewJob(db, NOW);
    const absences = await db.laborReview.findMany({ where: { type: 'ABSENCE_SUSPECTED' } });
    expect([result.absences, absences.map((row) => [row.membershipId, row.reasonCode])]).toEqual([
      1,
      [['m-part', 'ABSENCE:2026-11-09']],
    ]);
  });

  it('다시 돌려도 같은 날 결근 의심을 또 만들지 않는다', async () => {
    await runDailyReviewJob(db, NOW);
    const second = await runDailyReviewJob(db, NOW);
    expect([second.absences, await db.laborReview.count({ where: { type: 'ABSENCE_SUSPECTED' } })]).toEqual([0, 2]);
  });

  it('최근 퇴근 근무를 다시 평가한다 (퇴근 직후 평가가 실패했을 때)', async () => {
    await work('late', 'm-part', '2026-11-09T18:00:00', '2026-11-10T00:30:00');
    await runDailyReviewJob(db, NOW);
    expect(await db.laborReview.count({ where: { sourceId: 'late' } })).toBe(2);
  });
});
