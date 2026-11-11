import type { PrismaClient } from '@chulgeunkok/db';
import { createTestDb } from '@chulgeunkok/db/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { computePayroll } from '@/features/payroll/server/payroll-service';

import { employeeNumberOf, runPayslipDraftJob, syncPeriodPayslips } from './payslip-sync-service';

const kst = (local: string) => new Date(`${local}+09:00`);
const NOW = kst('2026-11-20T12:00:00');
const OCTOBER = '2026-10-01';
const WAGE = 10320;
const OCTOBER_MONDAYS = ['05', '12', '19', '26'];

let db: PrismaClient;
let close: () => Promise<void>;

const mondayShift = (date: string) => ({
  storeId: 'store',
  membershipId: 'm-staff',
  termsId: 't-staff',
  clockInAt: kst(`${date}T18:00:00`),
  clockOutAt: kst(`${date}T23:00:00`),
  status: 'CLOSED' as const,
});

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  await db.user.createMany({
    data: [
      { id: 'owner', name: '김사장' },
      { id: 'staff', name: '이알바' },
      { id: 'idle', name: '박신입' },
    ],
  });
  await db.store.create({ data: { id: 'store', name: '골목카페', payDay: 10 } });
  await db.membership.createMany({
    data: [
      { id: 'm-owner', storeId: 'store', userId: 'owner', role: 'OWNER', joinedAt: kst('2026-06-01T00:00:00') },
      { id: 'm-staff', storeId: 'store', userId: 'staff', role: 'EMPLOYEE', joinedAt: kst('2026-06-02T00:00:00') },
      { id: 'm-idle', storeId: 'store', userId: 'idle', role: 'EMPLOYEE', joinedAt: kst('2026-06-03T00:00:00') },
    ],
  });
  // 월 18:00–23:00, 시급 10,320
  await db.employmentTerms.create({
    data: {
      id: 't-staff',
      membershipId: 'm-staff',
      version: 1,
      effectiveFrom: kst('2026-06-01T00:00:00'),
      hourlyWage: WAGE,
      contractStartDate: new Date('2026-06-01'),
      createdById: 'owner',
      schedules: { create: [{ weekday: 1, startMinute: 18 * 60, workMinutes: 5 * 60 }] },
    },
  });
  await db.attendance.createMany({ data: OCTOBER_MONDAYS.map((day) => mondayShift(`2026-10-${day}`)) });
});

afterEach(async () => {
  await close();
});

const sync = (periodStart = OCTOBER, now = NOW) => syncPeriodPayslips(db, { storeId: 'store', periodStart, now });
const staffPayslips = () =>
  db.payslip.findMany({ where: { membershipId: 'm-staff' }, orderBy: { version: 'asc' }, include: { lines: true } });
const basePayOf = (payslip: { lines: { code: string; amount: number }[] } | undefined) =>
  payslip?.lines.find((l) => l.code === 'BASE_PAY')?.amount;
/** 10/5 퇴근을 hours 시간 늘린다 */
const extendFirstShift = (hours: number) =>
  db.attendance.updateMany({
    where: { membershipId: 'm-staff', clockInAt: kst('2026-10-05T18:00:00') },
    data: { clockOutAt: new Date(kst('2026-10-05T23:00:00').getTime() + hours * 3_600_000) },
  });
const markSent = (version: number) =>
  db.payslip.updateMany({ where: { membershipId: 'm-staff', version }, data: { status: 'SENT', sentAt: NOW } });

describe('syncPeriodPayslips', () => {
  it('기간이 끝나기 전에는 만들지 않는다', async () => {
    expect(await sync('2026-11-01')).toEqual({ created: 0, updated: 0 });
    expect(await db.payslip.count()).toBe(0);
  });

  it('끝난 기간에 근무한 직원만 v1 DRAFT', async () => {
    expect(await sync()).toEqual({ created: 1, updated: 0 });
    const [draft] = await staffPayslips();
    const { preview } = await computePayroll(db, { storeId: 'store', periodStart: OCTOBER, now: NOW });
    const staff = preview.members.find((m) => m.memberId === 'm-staff');
    const earnings = draft?.lines.filter((l) => l.kind === 'EARNING').reduce((sum, l) => sum + l.amount, 0);
    expect(await db.payslip.count()).toBe(1);
    expect([draft?.status, draft?.version, earnings, draft?.grossPay]).toEqual([
      'DRAFT',
      1,
      (staff?.basePayEstimate ?? 0) + (staff?.allowances.total ?? 0),
      4 * 5 * WAGE,
    ]);
    expect([draft?.employeeName, draft?.workDays, draft?.payDate?.toISOString().slice(0, 10), draft?.deductionType]).toEqual([
      '이알바',
      4,
      '2026-11-10',
      'NONE',
    ]);
  });

  it('DRAFT는 근태가 바뀌면 갱신된다', async () => {
    await sync();
    const [before] = await staffPayslips();
    await extendFirstShift(1);
    expect(await sync()).toEqual({ created: 0, updated: 1 });
    const [after] = await staffPayslips();
    expect([after?.id, basePayOf(after), after?.grossPay]).toEqual([before?.id, 21 * WAGE, 21 * WAGE]);
  });

  it('근태가 그대로면 DRAFT를 고치지 않는다', async () => {
    await sync();
    expect(await sync()).toEqual({ created: 0, updated: 0 });
  });

  it('SENT 뒤 근태가 바뀌면 v2 DRAFT, 같으면 안 만든다', async () => {
    await sync();
    await markSent(1);
    expect(await sync()).toEqual({ created: 0, updated: 0 });
    await extendFirstShift(1);
    expect(await sync()).toEqual({ created: 1, updated: 0 });
    const payslips = await staffPayslips();
    expect(payslips.map((p) => [p.version, p.status, basePayOf(p)])).toEqual([
      [1, 'SENT', 20 * WAGE],
      [2, 'DRAFT', 21 * WAGE],
    ]);
    expect(payslips[1]?.payDate).toEqual(payslips[0]?.payDate);
  });

  it('정정본은 보낸 본의 CUSTOM 줄을 복사한다', async () => {
    await sync();
    const [sent] = await staffPayslips();
    await db.payslipLine.create({
      data: { payslipId: sent?.id ?? '', kind: 'EARNING', code: 'CUSTOM', label: '식대', basis: '', amount: 50_000, sortOrder: 9 },
    });
    await markSent(1);
    await extendFirstShift(1);
    await sync();
    const [, correction] = await staffPayslips();
    expect(correction?.lines.find((l) => l.code === 'CUSTOM')?.amount).toBe(50_000);
    expect(correction?.grossPay).toBe(21 * WAGE + 50_000);
  });

  it('정정 DRAFT가 있으면 새 버전을 만들지 않고 갱신한다', async () => {
    await sync();
    await markSent(1);
    await extendFirstShift(1);
    await sync();
    await extendFirstShift(2);
    expect(await sync()).toEqual({ created: 0, updated: 1 });
    const payslips = await staffPayslips();
    expect(payslips.map((p) => [p.version, basePayOf(p)])).toEqual([
      [1, 20 * WAGE],
      [2, 22 * WAGE],
    ]);
  });

  it('동시에 동기화해도 DRAFT는 1건', async () => {
    await Promise.all([sync(), sync()]);
    expect(await db.payslip.count({ where: { status: 'DRAFT' } })).toBe(1);
  });

  it('4대보험 직원 초안은 직전 기간 보낸 공제 금액으로 채운다', async () => {
    await db.employmentTerms.update({ where: { id: 't-staff' }, data: { deductionType: 'SOCIAL_INSURANCE' } });
    await db.payslip.create({
      data: {
        storeId: 'store',
        membershipId: 'm-staff',
        periodStart: new Date('2026-09-01'),
        periodEnd: new Date('2026-10-01'),
        version: 1,
        status: 'SENT',
        employeeName: '이알바',
        employeeNumber: 2,
        workDays: 0,
        recognizedSeconds: 0,
        overtimeSeconds: 0,
        nightSeconds: 0,
        holidaySeconds: 0,
        deductionType: 'SOCIAL_INSURANCE',
        grossPay: 0,
        totalDeduction: 40_000,
        netPay: -40_000,
        lines: {
          create: [{ kind: 'DEDUCTION', code: 'NATIONAL_PENSION', label: '국민연금', basis: '', amount: 40_000, sortOrder: 0 }],
        },
      },
    });
    await sync();
    const draft = await db.payslip.findFirstOrThrow({ where: { periodStart: new Date(OCTOBER) }, include: { lines: true } });
    expect([draft.deductionType, draft.lines.find((l) => l.code === 'NATIONAL_PENSION')?.amount, draft.totalDeduction]).toEqual([
      'SOCIAL_INSURANCE',
      40_000,
      40_000,
    ]);
  });
});

describe('employeeNumberOf', () => {
  it('사원번호는 joinedAt 순번', async () => {
    const numbers = await Promise.all(
      ['m-owner', 'm-staff', 'm-idle'].map((id) => employeeNumberOf(db, { id, storeId: 'store' })),
    );
    expect(numbers).toEqual([1, 2, 3]);
    await sync();
    expect((await staffPayslips())[0]?.employeeNumber).toBe(2);
  });
});

describe('runPayslipDraftJob', () => {
  it('runPayslipDraftJob은 직전 3기간을 본다', async () => {
    await db.attendance.createMany({ data: ['2026-07-06', '2026-08-03', '2026-11-02'].map(mondayShift) });
    expect(await runPayslipDraftJob(db, NOW)).toEqual({ stores: 1, created: 2, updated: 0 });
    const periods = await db.payslip.findMany({ orderBy: { periodStart: 'asc' }, select: { periodStart: true } });
    expect(periods.map((p) => p.periodStart.toISOString().slice(0, 10))).toEqual(['2026-08-01', '2026-10-01']);
  });

  it('비활성 매장은 건너뛴다', async () => {
    await db.store.update({ where: { id: 'store' }, data: { status: 'CLOSED' } });
    expect(await runPayslipDraftJob(db, NOW)).toEqual({ stores: 0, created: 0, updated: 0 });
  });
});
