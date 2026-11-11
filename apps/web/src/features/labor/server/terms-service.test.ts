import type { PrismaClient } from '@chulgeunkok/db';
import { createTestDb } from '@chulgeunkok/db/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { CreateTermsInput } from '../schema';

import { listStoreReviews, updateReview } from './review-service';
import { createEmploymentTerms, listTermsHistory } from './terms-service';

const NOW = new Date('2026-11-04T01:00:00Z'); // 11/4 10:00 KST

let db: PrismaClient;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  await db.user.createMany({
    data: [
      { id: 'owner', name: '김사장', phone: '+821000000001' },
      { id: 'manager', name: '최매니저' },
      { id: 'staff', name: '이알바' },
    ],
  });
  await db.store.create({ data: { id: 'store', name: '골목카페' } });
  await db.membership.createMany({
    data: [
      { id: 'm-owner', storeId: 'store', userId: 'owner', role: 'OWNER' },
      { id: 'm-manager', storeId: 'store', userId: 'manager', role: 'MANAGER' },
      { id: 'm-staff', storeId: 'store', userId: 'staff', role: 'EMPLOYEE' },
    ],
  });
  await db.storeHeadcountDeclaration.create({
    data: { storeId: 'store', band: 'UNDER_5', effectiveFrom: new Date('2026-01-01'), declaredById: 'owner' },
  });
});

afterEach(async () => {
  await close();
});

/** 월·수·금 18:00–23:00, 휴게 30분 → 주 810분: 주휴 안내 없음, 단시간 안내 있음 */
const terms = (overrides: Partial<CreateTermsInput> = {}): CreateTermsInput => ({
  effectiveFrom: '2026-11-04',
  hourlyWage: 10320,
  schedules: [1, 3, 5].map((weekday) => ({ weekday, startTime: '18:00', endTime: '23:00', breakMinutes: 30 })),
  scheduleVaries: false,
  averageWeeklyMinutesOverride: null,
  weeklyHolidayWeekday: 0,
  contractStartDate: '2026-11-01',
  contractEndDate: null,
  confirmBelowMinimumWage: false,
  deductionType: 'NONE',
  ...overrides,
});

const create = (body: CreateTermsInput = terms(), actorUserId = 'owner', now = NOW) =>
  createEmploymentTerms(db, { storeId: 'store', actorUserId, memberId: 'm-staff', body, now });

describe('createEmploymentTerms', () => {
  it('첫 근로조건은 버전 1이고 요일별 시간을 그대로 돌려준다', async () => {
    const { terms: created } = await create();
    expect([created.version, created.schedules[0]?.startTime, created.schedules[0]?.endTime, created.weeklyContractMinutes]).toEqual([
      1,
      '18:00',
      '23:00',
      810,
    ]);
  });

  it('공제 방식을 저장하고 돌려준다', async () => {
    const { terms: created } = await create(terms({ deductionType: 'WITHHOLDING_3_3' }));
    expect(created.deductionType).toBe('WITHHOLDING_3_3');
  });

  it('자정을 넘는 근무를 그대로 저장한다', async () => {
    const body = terms({ schedules: [{ weekday: 5, startTime: '20:00', endTime: '02:00', breakMinutes: 30 }] });
    const { terms: created } = await create(body);
    expect(created.schedules[0]?.endTime).toBe('02:00');
  });

  it('적용 시작은 그날 서울 자정이다', async () => {
    const { terms: created } = await create();
    expect(created.effectiveFrom).toBe('2026-11-03T15:00:00.000Z');
  });

  it('최저임금 미달은 확인 없이는 저장하지 않는다', async () => {
    await expect(create(terms({ hourlyWage: 10000 }))).rejects.toMatchObject({
      code: 'MINIMUM_WAGE_CONFIRM_REQUIRED',
      details: { minimumHourlyWage: 10320 },
    });
    expect(await db.employmentTerms.count()).toBe(0);
  });

  it('확인하면 저장되고 최저임금 안내가 생긴다', async () => {
    const { reviews } = await create(terms({ hourlyWage: 10000, confirmBelowMinimumWage: true }));
    expect(reviews[0]).toMatchObject({ type: 'MINIMUM_WAGE', presentation: 'SHEET' });
  });

  it('5인 미만 매장에서 단시간 안내는 배지로만 둔다', async () => {
    const { reviews } = await create();
    expect(reviews.find((review) => review.type === 'SHORT_TIME_OVERTIME')?.presentation).toBe('BADGE');
  });

  it('새 버전은 이전 버전을 그 시작 시각에 닫고, 이전 안내는 대체된다', async () => {
    const first = await create();
    await create(terms({ effectiveFrom: '2026-11-10', hourlyWage: 11000 }));
    const history = await listTermsHistory(db, { storeId: 'store', actorUserId: 'owner', memberId: 'm-staff' });
    const oldReviews = await db.laborReview.findMany({ where: { sourceId: first.terms.id } });
    expect([history.map((version) => version.version), history[1]?.effectiveTo, new Set(oldReviews.map((review) => review.status))]).toEqual([
      [2, 1],
      '2026-11-09T15:00:00.000Z',
      new Set(['SUPERSEDED']),
    ]);
  });

  it('근무 기록이 없으면 같은 날 다시 저장해 오타를 고칠 수 있다', async () => {
    await create();
    await create(terms({ hourlyWage: 10500 }));
    const versions = await db.employmentTerms.findMany();
    expect(versions.map((version) => [version.version, version.hourlyWage])).toEqual([[2, 10500]]);
  });

  it('적용 시작 이후 근무 기록이 있으면 TERMS_HAS_LATER_ATTENDANCE', async () => {
    const { terms: created } = await create();
    await db.attendance.create({
      data: { storeId: 'store', membershipId: 'm-staff', termsId: created.id, clockInAt: NOW },
    });
    await expect(create(terms({ hourlyWage: 10500 }))).rejects.toMatchObject({ code: 'TERMS_HAS_LATER_ATTENDANCE' });
  });

  it('현재 버전보다 이른 날짜는 TERMS_EFFECTIVE_BEFORE_CURRENT', async () => {
    await create();
    await expect(create(terms({ effectiveFrom: '2026-11-02' }))).rejects.toMatchObject({
      code: 'TERMS_EFFECTIVE_BEFORE_CURRENT',
    });
  });

  it('권한 없는 Manager는 등록할 수 없다', async () => {
    await expect(create(terms(), 'manager')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('직원은 자기 근로조건 이력을 볼 수 있다', async () => {
    await create();
    const history = await listTermsHistory(db, { storeId: 'store', actorUserId: 'staff', memberId: 'm-staff' });
    expect(history).toHaveLength(1);
  });

  it('직원은 다른 사람 근로조건을 볼 수 없다', async () => {
    await expect(
      listTermsHistory(db, { storeId: 'store', actorUserId: 'staff', memberId: 'm-owner' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('검토 항목', () => {
  it('처리할 일 목록에는 대체된 안내가 없다', async () => {
    await create();
    await create(terms({ effectiveFrom: '2026-11-10' }));
    const reviews = await listStoreReviews(db, { storeId: 'store', actorUserId: 'owner', now: NOW });
    const latest = await db.employmentTerms.findFirstOrThrow({ where: { version: 2 } });
    const sources = await db.laborReview.findMany({ where: { id: { in: reviews.map((review) => review.id) } } });
    expect(new Set(sources.map((review) => review.sourceId))).toEqual(new Set([latest.id]));
  });

  it('확인했어요를 누르면 ACKNOWLEDGED가 되고 처리할 일에서 빠진다', async () => {
    const { reviews } = await create(terms({ hourlyWage: 10000, confirmBelowMinimumWage: true }));
    const target = reviews[0]!;
    const updated = await updateReview(db, { reviewId: target.id, actorUserId: 'owner', change: { status: 'ACKNOWLEDGED' }, now: NOW });
    const open = await listStoreReviews(db, { storeId: 'store', actorUserId: 'owner', now: NOW });
    expect([updated.status, updated.seen, open.some((review) => review.id === target.id)]).toEqual(['ACKNOWLEDGED', true, false]);
  });

  it('대체된 안내는 확인 처리할 수 없다', async () => {
    const { reviews } = await create();
    await create(terms({ effectiveFrom: '2026-11-10' }));
    await expect(
      updateReview(db, { reviewId: reviews[0]!.id, actorUserId: 'owner', change: { status: 'ACKNOWLEDGED' }, now: NOW }),
    ).rejects.toMatchObject({ code: 'LABOR_REVIEW_STATUS_INVALID' });
  });

  it('직원은 검토 항목을 볼 수 없다', async () => {
    await expect(listStoreReviews(db, { storeId: 'store', actorUserId: 'staff', now: NOW })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});
