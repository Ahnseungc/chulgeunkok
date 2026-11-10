import type { PrismaClient } from '@chulgeunkok/db';
import { createTestDb } from '@chulgeunkok/db/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildDetailCsv, buildSummaryCsv } from './payroll-export';
import { getPayrollPreview, loadPayroll } from './payroll-service';

const kst = (local: string) => new Date(`${local}+09:00`);
const NOW = kst('2026-11-20T12:00:00');
const HOUR = 3600;

let db: PrismaClient;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  await db.user.createMany({
    data: [
      { id: 'owner', name: '김사장', phone: '+821000000001' },
      { id: 'manager', name: '최매니저' },
      { id: 'staff', name: '=이알바', phone: '+821012345678' },
      { id: 'idle', name: '박신입' },
    ],
  });
  await db.store.create({ data: { id: 'store', name: '골목카페' } });
  await db.membership.createMany({
    data: [
      { id: 'm-owner', storeId: 'store', userId: 'owner', role: 'OWNER' },
      { id: 'm-manager', storeId: 'store', userId: 'manager', role: 'MANAGER', permissions: ['PAYROLL_READ'] },
      { id: 'm-staff', storeId: 'store', userId: 'staff', role: 'EMPLOYEE' },
      { id: 'm-idle', storeId: 'store', userId: 'idle', role: 'EMPLOYEE' },
    ],
  });
  // 11/10부터 시급 인상
  await db.employmentTerms.createMany({
    data: [
      { id: 't1', membershipId: 'm-staff', version: 1, effectiveFrom: kst('2026-10-01T00:00:00'), effectiveTo: kst('2026-11-10T00:00:00'), hourlyWage: 10320, contractStartDate: new Date('2026-10-01'), createdById: 'owner' },
      { id: 't2', membershipId: 'm-staff', version: 2, effectiveFrom: kst('2026-11-10T00:00:00'), hourlyWage: 11000, contractStartDate: new Date('2026-10-01'), createdById: 'owner' },
    ],
  });
  await db.attendance.createMany({
    data: [
      { storeId: 'store', membershipId: 'm-staff', termsId: 't1', clockInAt: kst('2026-11-02T18:00:00'), clockOutAt: kst('2026-11-02T21:00:00'), status: 'CLOSED' },
      { storeId: 'store', membershipId: 'm-staff', termsId: 't2', clockInAt: kst('2026-11-12T18:00:00'), clockOutAt: kst('2026-11-12T21:00:00'), status: 'CLOSED' },
      { storeId: 'store', membershipId: 'm-staff', termsId: 't2', clockInAt: kst('2026-11-14T18:00:00'), status: 'MISSING_CLOCK_OUT' },
    ],
  });
});

afterEach(async () => {
  await close();
});

const preview = (actorUserId = 'owner') => getPayrollPreview(db, { storeId: 'store', actorUserId, now: NOW });

describe('getPayrollPreview', () => {
  it('직원별 인정 시간·예상 기본급을 근태의 시급으로 계산한다', async () => {
    const staff = (await preview()).members.find((member) => member.memberId === 'm-staff');
    // 3h × 10,320 + 3h × 11,000 = 63,960
    expect([staff?.recognizedSeconds, staff?.basePayEstimate, staff?.byWage.length]).toEqual([6 * HOUR, 63960, 2]);
  });

  it('퇴근 누락은 합계에서 빼고 미해결로 센다', async () => {
    const result = await preview();
    expect([result.unresolved.missingClockOut, result.members.find((m) => m.memberId === 'm-staff')?.attendanceCount]).toEqual([1, 2]);
  });

  it('근무가 없는 재직 직원도 0원으로 보여 주고, 근무 없는 사장님은 뺀다', async () => {
    const ids = (await preview()).members.map((member) => member.memberId);
    expect([ids.includes('m-idle'), ids.includes('m-owner')]).toEqual([true, false]);
  });

  it('PAYROLL_READ가 있는 매니저는 볼 수 있다', async () => {
    expect((await preview('manager')).totals.basePayEstimate).toBe(63960);
  });

  it('직원은 볼 수 없다', async () => {
    await expect(preview('staff')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('규모 신고가 없으면 UNKNOWN 이고 가산수당은 0원', async () => {
    const result = await preview();
    expect([result.headcountBand, result.totals.allowanceEstimate]).toEqual(['UNKNOWN', 0]);
  });
});

describe('예상 주휴·가산수당 (payroll §3.6)', () => {
  beforeEach(async () => {
    await db.user.create({ data: { id: 'full', name: '정직원' } });
    await db.membership.create({ data: { id: 'm-full', storeId: 'store', userId: 'full', role: 'EMPLOYEE' } });
    // 월~금 09:00–18:00 휴게 60분, 주휴일 일요일
    await db.employmentTerms.create({
      data: {
        id: 't-full',
        membershipId: 'm-full',
        version: 1,
        effectiveFrom: kst('2026-10-01T00:00:00'),
        hourlyWage: 10000,
        weeklyHolidayWeekday: 0,
        contractStartDate: new Date('2026-10-01'),
        createdById: 'owner',
        schedules: { create: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startMinute: 9 * 60, workMinutes: 9 * 60, breakMinutes: 60 })) },
      },
    });
    // 11/2(월)은 20시까지 → 인정 10h, 연장 2h
    await db.attendance.createMany({
      data: ['02', '03', '04', '05', '06'].map((day) => ({
        storeId: 'store',
        membershipId: 'm-full',
        termsId: 't-full',
        clockInAt: kst(`2026-11-${day}T09:00:00`),
        clockOutAt: kst(`2026-11-${day}T${day === '02' ? '20' : '18'}:00:00`),
        status: 'CLOSED' as const,
      })),
    });
  });

  const fullMember = async () => (await preview()).members.find((member) => member.memberId === 'm-full');

  it('개근한 주의 주휴수당은 규모 신고와 상관없이 넣는다', async () => {
    const member = await fullMember();
    expect([member?.allowances.weeklyHolidayPay, member?.allowances.overtimePremium]).toEqual([80000, 0]);
  });

  it('5인 이상 신고 기간에는 연장 가산도 넣는다', async () => {
    await db.storeHeadcountDeclaration.create({
      data: { storeId: 'store', band: 'FIVE_OR_MORE', effectiveFrom: new Date('2026-01-01'), declaredById: 'owner' },
    });
    const result = await preview();
    const member = result.members.find((item) => item.memberId === 'm-full');
    expect([result.headcountBand, member?.allowances.overtimePremium, result.totals.allowanceEstimate]).toEqual([
      'FIVE_OR_MORE',
      10000,
      90000,
    ]);
  });
});

describe('CSV', () => {
  it('요약 CSV: 휴대폰은 뒤 4자리만, 이름 수식은 막는다', async () => {
    const csv = buildSummaryCsv(await loadPayroll(db, { storeId: 'store', actorUserId: 'owner', now: NOW }));
    const staffLine = csv.split('\r\n').find((line) => line.includes('이알바'));
    expect(staffLine).toBe("'=이알바,5678,재직,2,360,6:00,10320/11000,63960,0,0,0,0,63960,1,0,0");
    expect(csv.includes('01012345678')).toBe(false);
  });

  it('상세 CSV: 오래된 순, 퇴근 누락은 0분', async () => {
    const csv = buildDetailCsv(await loadPayroll(db, { storeId: 'store', actorUserId: 'owner', now: NOW }));
    const lines = csv.trim().split('\r\n').slice(1);
    expect(lines.map((line) => line.split(',').slice(1, 9).join(','))).toEqual([
      '2026-11-02,18:00,21:00,180,0,180,10320,정상',
      '2026-11-12,18:00,21:00,180,0,180,11000,정상',
      '2026-11-14,18:00,,0,0,0,11000,퇴근 누락',
    ]);
  });
});
