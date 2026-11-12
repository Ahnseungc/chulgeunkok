import type { PrismaClient } from '@chulgeunkok/db';
import { createTestDb } from '@chulgeunkok/db/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { canAccessVerified, requireMembership } from './require-membership';

let db: PrismaClient;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  await db.user.createMany({
    data: [
      { id: 'owner', name: '김사장' },
      { id: 'manager', name: '최매니저' },
      { id: 'verified', name: '박매니저', phone: '+821000000002' },
    ],
  });
  await db.store.create({ data: { id: 'store', name: '골목카페' } });
  await db.membership.createMany({
    data: [
      { id: 'm-owner', storeId: 'store', userId: 'owner', role: 'OWNER' },
      { id: 'm-manager', storeId: 'store', userId: 'manager', role: 'MANAGER', permissions: ['PAYROLL_READ'] },
      { id: 'm-verified', storeId: 'store', userId: 'verified', role: 'MANAGER', permissions: ['PAYROLL_READ'] },
    ],
  });
});

afterEach(async () => {
  await close();
});

const guard = (userId: string, action: Parameters<typeof requireMembership>[0]['action'] = 'PAYROLL') =>
  requireMembership({ storeId: 'store', userId, action }, db);

describe('requireMembership — 급여 권한 Manager 휴대폰 인증 (auth §4.2)', () => {
  it('휴대폰 인증 전이면 PHONE_VERIFICATION_REQUIRED', async () => {
    await expect(guard('manager')).rejects.toMatchObject({ code: 'PHONE_VERIFICATION_REQUIRED', status: 403 });
  });

  it('휴대폰 인증을 했으면 통과한다', async () => {
    await expect(guard('verified')).resolves.toMatchObject({ id: 'm-verified' });
  });

  it('사장님은 번호가 없어도(개발 세션 등) 그대로 통과한다', async () => {
    await expect(guard('owner')).resolves.toMatchObject({ id: 'm-owner' });
  });

  it('급여가 아닌 동작은 휴대폰 인증을 묻지 않는다', async () => {
    await expect(guard('manager', 'DASHBOARD')).resolves.toMatchObject({ id: 'm-manager' });
  });

  it('PAYROLL_READ로만 근로조건·검토 안내(시급)를 보는 Manager도 인증 전이면 PHONE_VERIFICATION_REQUIRED', async () => {
    await expect(guard('manager', 'TERMS_READ')).rejects.toMatchObject({ code: 'PHONE_VERIFICATION_REQUIRED' });
    await expect(guard('manager', 'LABOR_REVIEW')).rejects.toMatchObject({ code: 'PHONE_VERIFICATION_REQUIRED' });
    await expect(guard('verified', 'TERMS_READ')).resolves.toMatchObject({ id: 'm-verified' });
  });

  it('TERMS_EDIT Manager는 인증 없이 근로조건·검토 안내를 보지만 급여는 인증 뒤에만', async () => {
    await db.membership.update({ where: { id: 'm-manager' }, data: { permissions: ['PAYROLL_READ', 'TERMS_EDIT'] } });
    await expect(guard('manager', 'TERMS_READ')).resolves.toMatchObject({ id: 'm-manager' });
    await expect(guard('manager', 'LABOR_REVIEW')).resolves.toMatchObject({ id: 'm-manager' });
    await expect(guard('manager')).rejects.toMatchObject({ code: 'PHONE_VERIFICATION_REQUIRED' });
  });

  it('사장님은 근로조건도 그대로', async () => {
    await expect(guard('owner', 'TERMS_READ')).resolves.toMatchObject({ id: 'm-owner' });
  });

  it('권한 없는 Manager는 인증 여부와 상관없이 FORBIDDEN', async () => {
    await db.membership.update({ where: { id: 'm-manager' }, data: { permissions: [] } });
    await expect(guard('manager')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('canAccessVerified', () => {
  it('인증 전 Manager는 false, 인증한 Manager·사장님은 true', async () => {
    const members = await db.membership.findMany({ orderBy: { id: 'asc' } });
    const results = await Promise.all(members.map(async (member) => [member.id, await canAccessVerified(db, member, 'PAYROLL')]));
    expect(results).toEqual([
      ['m-manager', false],
      ['m-owner', true],
      ['m-verified', true],
    ]);
  });
});
