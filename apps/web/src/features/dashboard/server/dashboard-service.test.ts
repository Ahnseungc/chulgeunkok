import type { PrismaClient } from '@chulgeunkok/db';
import { createTestDb } from '@chulgeunkok/db/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getDashboard } from './dashboard-service';

/** 2026-11-04(수) 19:00 KST */
const NOW = new Date('2026-11-04T19:00:00+09:00');
const kst = (local: string) => new Date(`${local}+09:00`);

let db: PrismaClient;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  await db.user.createMany({
    data: [
      { id: 'owner', name: '김사장', phone: '+821000000001' },
      { id: 'manager', name: '최매니저' },
      { id: 'early', name: '이알바' },
      { id: 'late', name: '박신입' },
      { id: 'noterms', name: '한새봄' },
    ],
  });
  await db.store.create({ data: { id: 'store', name: '골목카페' } });
  await db.membership.createMany({
    data: [
      { id: 'm-owner', storeId: 'store', userId: 'owner', role: 'OWNER' },
      { id: 'm-manager', storeId: 'store', userId: 'manager', role: 'MANAGER' },
      { id: 'm-early', storeId: 'store', userId: 'early', role: 'EMPLOYEE' },
      { id: 'm-late', storeId: 'store', userId: 'late', role: 'EMPLOYEE' },
      { id: 'm-noterms', storeId: 'store', userId: 'noterms', role: 'EMPLOYEE' },
    ],
  });
  // 수요일 18:00 시작(early) / 수요일 21:00 시작(late) / 매니저는 근로조건 있음, 수요일 근무 없음
  for (const [memberId, startMinute, weekday] of [
    ['m-early', 18 * 60, 3],
    ['m-late', 21 * 60, 3],
    ['m-manager', 10 * 60, 1],
  ] as const) {
    await db.employmentTerms.create({
      data: {
        id: `terms-${memberId}`,
        membershipId: memberId,
        version: 1,
        effectiveFrom: kst('2026-11-01T00:00:00'),
        hourlyWage: 10320,
        contractStartDate: new Date('2026-11-01'),
        createdById: 'owner',
        schedules: { create: [{ weekday, startMinute, workMinutes: 300, breakMinutes: 30 }] },
      },
    });
  }
  // 지난 월요일 근무 완료 (4시간 30분 인정, 46,440원)
  await db.attendance.create({
    data: {
      storeId: 'store',
      membershipId: 'm-manager',
      termsId: 'terms-m-manager',
      clockInAt: kst('2026-11-02T10:00:00'),
      clockOutAt: kst('2026-11-02T15:00:00'),
      status: 'CLOSED',
    },
  });
});

afterEach(async () => {
  await close();
});

const dashboard = (actorUserId = 'owner') => getDashboard(db, { storeId: 'store', actorUserId, now: NOW });

describe('getDashboard', () => {
  it('지금 근무 중인 사람을 보여 준다', async () => {
    await db.attendance.create({
      data: { storeId: 'store', membershipId: 'm-early', termsId: 'terms-m-early', clockInAt: kst('2026-11-04T18:02:00') },
    });
    expect((await dashboard()).working.map((row) => row.name)).toEqual(['이알바']);
  });

  it('소정 시작이 지났는데 출근 안 한 사람만 "아직 출근 전"이다', async () => {
    const { today } = await dashboard();
    expect([today.scheduledCount, today.clockedInCount, today.notYetClockedIn.map((row) => row.name)]).toEqual([
      2,
      0,
      ['이알바'],
    ]);
  });

  it('출근하면 "아직 출근 전"에서 빠진다', async () => {
    await db.attendance.create({
      data: { storeId: 'store', membershipId: 'm-early', termsId: 'terms-m-early', clockInAt: kst('2026-11-04T18:02:00') },
    });
    const { today } = await dashboard();
    expect([today.clockedInCount, today.notYetClockedIn]).toEqual([1, []]);
  });

  it('근로조건 없는 직원 수를 센다 (사장님 제외)', async () => {
    expect((await dashboard()).todo.termsMissing).toBe(1);
  });

  it('이번 정산 기간 근무시간과 예상 기본급을 정산 규칙으로 계산한다', async () => {
    const { currentPeriod } = await dashboard();
    expect(currentPeriod).toEqual({
      start: '2026-11-01',
      end: '2026-12-01',
      recognizedSeconds: 4.5 * 3600,
      basePayEstimate: 46440,
      allowanceEstimate: 0,
    });
  });

  it('권한 없는 Manager에게는 금액과 검토 수를 숨긴다', async () => {
    const { currentPeriod, todo } = await dashboard('manager');
    expect([currentPeriod.basePayEstimate, currentPeriod.allowanceEstimate, todo.laborReviews, currentPeriod.recognizedSeconds]).toEqual([
      null,
      null,
      null,
      4.5 * 3600,
    ]);
  });

  it('확인할 명세서 초안 수와 가장 오래된 기간을 사장님에게만 준다', async () => {
    const draftOf = (periodStart: string, periodEnd: string) => ({
      storeId: 'store',
      membershipId: 'm-early',
      periodStart: new Date(periodStart),
      periodEnd: new Date(periodEnd),
      version: 1,
      employeeName: '이알바',
      employeeNumber: 3,
      workDays: 0,
      recognizedSeconds: 0,
      overtimeSeconds: 0,
      nightSeconds: 0,
      holidaySeconds: 0,
      deductionType: 'NONE' as const,
      grossPay: 0,
      totalDeduction: 0,
      netPay: 0,
    });
    await db.payslip.createMany({ data: [draftOf('2026-11-01', '2026-12-01'), draftOf('2026-10-01', '2026-11-01')] });
    const [owner, manager] = [(await dashboard()).todo, (await dashboard('manager')).todo];
    expect([owner.payslipDrafts, owner.payslipDraftPeriodStart, manager.payslipDrafts, manager.payslipDraftPeriodStart]).toEqual([
      2,
      '2026-10-01',
      null,
      null,
    ]);
  });

  it('직원은 대시보드를 볼 수 없다', async () => {
    await expect(dashboard('early')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
