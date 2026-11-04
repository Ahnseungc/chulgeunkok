import type { PrismaClient } from '@chulgeunkok/db';
import { createTestDb } from '@chulgeunkok/db/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getMember, listMembers, updateMember } from './member-service';

const NOW = new Date('2026-11-04T01:00:00Z');

let db: PrismaClient;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  await db.user.createMany({
    data: [
      { id: 'owner', name: '김사장', phone: '+821000000001' },
      { id: 'manager', name: '최매니저' },
      { id: 'staff-a', name: '가나다' },
      { id: 'staff-b', name: '이알바' },
    ],
  });
  await db.store.create({ data: { id: 'store', name: '골목카페' } });
  await db.membership.createMany({
    data: [
      { id: 'm-owner', storeId: 'store', userId: 'owner', role: 'OWNER' },
      { id: 'm-manager', storeId: 'store', userId: 'manager', role: 'MANAGER' },
      { id: 'm-a', storeId: 'store', userId: 'staff-a', role: 'EMPLOYEE' },
      { id: 'm-b', storeId: 'store', userId: 'staff-b', role: 'EMPLOYEE' },
    ],
  });
  await db.employmentTerms.create({
    data: {
      id: 'terms-b',
      membershipId: 'm-b',
      version: 1,
      effectiveFrom: new Date('2026-11-01T00:00:00+09:00'),
      hourlyWage: 10320,
      contractStartDate: new Date('2026-11-01'),
      createdById: 'owner',
    },
  });
});

afterEach(async () => {
  await close();
});

const startWork = () =>
  db.attendance.create({
    data: { id: 'working', storeId: 'store', membershipId: 'm-b', termsId: 'terms-b', clockInAt: NOW },
  });

describe('listMembers', () => {
  it('근무 중인 직원을 맨 위에, 근로조건 여부를 함께 보여 준다', async () => {
    await startWork();
    const members = await listMembers(db, { storeId: 'store', actorUserId: 'owner', status: 'ACTIVE' });
    expect(members.map((member) => [member.name, member.isWorking, member.hasTerms])).toEqual([
      ['이알바', true, true],
      ['김사장', false, false],
      ['최매니저', false, false],
      ['가나다', false, false],
    ]);
  });

  it('직원은 직원 목록을 볼 수 없다', async () => {
    await expect(listMembers(db, { storeId: 'store', actorUserId: 'staff-a', status: 'ACTIVE' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});

describe('getMember', () => {
  it('사장님은 근로조건을 보고 고칠 수 있다', async () => {
    const member = await getMember(db, { storeId: 'store', actorUserId: 'owner', memberId: 'm-b' });
    expect([member.currentTerms?.hourlyWage, member.canEditTerms]).toEqual([10320, true]);
  });

  it('권한 없는 Manager에게는 시급을 보여 주지 않는다', async () => {
    const member = await getMember(db, { storeId: 'store', actorUserId: 'manager', memberId: 'm-b' });
    expect([member.currentTerms, member.canReadTerms, member.canEditTerms]).toEqual([null, false, false]);
  });
});

describe('updateMember', () => {
  it('비활성화하면 퇴사일이 남고 근로조건이 닫힌다', async () => {
    const member = await updateMember(db, {
      storeId: 'store',
      actorUserId: 'owner',
      memberId: 'm-b',
      change: { status: 'INACTIVE' },
      now: NOW,
    });
    const terms = await db.employmentTerms.findUniqueOrThrow({ where: { id: 'terms-b' } });
    expect([member.status, member.leftAt, terms.effectiveTo]).toEqual(['INACTIVE', NOW.toISOString(), NOW]);
  });

  it('근무 중인 직원은 비활성화할 수 없다', async () => {
    await startWork();
    await expect(
      updateMember(db, { storeId: 'store', actorUserId: 'owner', memberId: 'm-b', change: { status: 'INACTIVE' }, now: NOW }),
    ).rejects.toMatchObject({ code: 'MEMBER_HAS_OPEN_ATTENDANCE' });
  });

  it('사장님 계정은 바꿀 수 없다', async () => {
    await expect(
      updateMember(db, { storeId: 'store', actorUserId: 'owner', memberId: 'm-owner', change: { status: 'INACTIVE' }, now: NOW }),
    ).rejects.toMatchObject({ code: 'CANNOT_DEACTIVATE_OWNER' });
  });

  it('직원으로 내리면 위임 권한이 지워진다', async () => {
    await db.membership.update({ where: { id: 'm-manager' }, data: { permissions: ['PAYROLL_READ'] } });
    const member = await updateMember(db, {
      storeId: 'store',
      actorUserId: 'owner',
      memberId: 'm-manager',
      change: { role: 'EMPLOYEE' },
      now: NOW,
    });
    expect([member.role, member.permissions]).toEqual(['EMPLOYEE', []]);
  });

  it('Manager는 직원 상태를 바꿀 수 없다', async () => {
    await expect(
      updateMember(db, { storeId: 'store', actorUserId: 'manager', memberId: 'm-a', change: { status: 'INACTIVE' }, now: NOW }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
