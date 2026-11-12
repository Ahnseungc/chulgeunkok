import type { PrismaClient } from '@chulgeunkok/db';
import { createTestDb } from '@chulgeunkok/db/testing';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// 라우트가 쓰는 전역 db 를 테스트 DB 로 바꾼다
const holder = vi.hoisted(() => ({ db: null as unknown as PrismaClient }));
vi.mock('@/server/db', () => ({
  get db() {
    return holder.db;
  },
}));

import { PUT } from './route';

const params = { params: Promise.resolve({ attendanceId: 'a1' }) };
let close: () => Promise<void>;

// 지난주 근무 — 미래·35일 기한에 걸리지 않게 오늘 기준으로 잡는다
const lastWeek = (hour: number, minute = 0) => {
  const at = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  at.setUTCHours(hour - 9, minute, 0, 0);
  return at;
};

const put = (body: unknown, userId = 'owner') =>
  PUT(
    new NextRequest('http://localhost/api/v1/attendances/a1/breaks', {
      method: 'PUT',
      body: JSON.stringify(body),
      headers: { 'x-dev-user-id': userId },
    }),
    params,
  );

beforeEach(async () => {
  vi.stubEnv('DEV_AUTH', '1');
  const testDb = await createTestDb();
  holder.db = testDb.db;
  close = testDb.close;
  await holder.db.user.createMany({ data: [{ id: 'owner', name: '김사장' }, { id: 'staff', name: '이알바' }] });
  await holder.db.store.create({ data: { id: 'store', name: '골목카페' } });
  await holder.db.membership.createMany({
    data: [
      { id: 'm-owner', storeId: 'store', userId: 'owner', role: 'OWNER' },
      { id: 'm-staff', storeId: 'store', userId: 'staff', role: 'EMPLOYEE' },
    ],
  });
  await holder.db.employmentTerms.create({
    data: {
      id: 'terms',
      membershipId: 'm-staff',
      version: 1,
      effectiveFrom: new Date('2026-01-01T00:00:00+09:00'),
      hourlyWage: 10320,
      contractStartDate: new Date('2026-01-01'),
      createdById: 'owner',
    },
  });
  await holder.db.attendance.create({
    data: { id: 'a1', storeId: 'store', membershipId: 'm-staff', termsId: 'terms', clockInAt: lastWeek(10), clockOutAt: lastWeek(15), status: 'CLOSED' },
  });
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await close();
});

describe('PUT /api/v1/attendances/:attendanceId/breaks', () => {
  it('관리자가 휴게를 바꾸면 상세를 돌려준다', async () => {
    const res = await put({
      breaks: [{ startAt: lastWeek(12).toISOString(), endAt: lastWeek(12, 30).toISOString() }],
      reason: '휴게를 잘못 눌렀어요',
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: 'a1', breakSeconds: 30 * 60, revisions: [{ after: { breaks: [{}] } }] });
  });

  it('사유가 없으면 400 VALIDATION_FAILED', async () => {
    const res = await put({ breaks: [], reason: '' });
    expect([res.status, (await res.json()).error.code]).toEqual([400, 'VALIDATION_FAILED']);
  });

  it('직원이 부르면 403', async () => {
    const res = await put({ breaks: [], reason: '셀프' }, 'staff');
    expect(res.status).toBe(403);
  });
});
