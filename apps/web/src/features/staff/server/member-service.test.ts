import type { PrismaClient } from '@chulgeunkok/db';
import { createTestDb } from '@chulgeunkok/db/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getMember, listMembers, updateMember } from './member-service';
import { listMembershipEvents } from './membership-events';

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
    expect([member.currentTerms, member.termsAccess, member.canEditTerms]).toEqual([null, 'FORBIDDEN', false]);
  });
});

describe('getMember — 시급 노출 (auth §4.2)', () => {
  it('PAYROLL_READ로만 들어온 Manager는 휴대폰 인증 전엔 근로조건 대신 인증 안내를 받고, 인증하면 본다', async () => {
    await db.membership.update({ where: { id: 'm-manager' }, data: { permissions: ['PAYROLL_READ'] } });
    const before = await getMember(db, { storeId: 'store', actorUserId: 'manager', memberId: 'm-b' });
    await db.user.update({ where: { id: 'manager' }, data: { phone: '+821000000009' } });
    const after = await getMember(db, { storeId: 'store', actorUserId: 'manager', memberId: 'm-b' });
    expect([before.termsAccess, before.currentTerms, after.termsAccess, after.currentTerms?.hourlyWage]).toEqual([
      'PHONE_VERIFICATION_REQUIRED',
      null,
      'ALLOWED',
      10320,
    ]);
  });

  it('인증 전이라도 본인 근로조건은 본다 (API 본인 경로와 같게)', async () => {
    await db.membership.update({ where: { id: 'm-manager' }, data: { permissions: ['PAYROLL_READ'] } });
    await db.employmentTerms.create({
      data: {
        id: 'terms-manager',
        membershipId: 'm-manager',
        version: 1,
        effectiveFrom: new Date('2026-11-01T00:00:00+09:00'),
        hourlyWage: 11000,
        contractStartDate: new Date('2026-11-01'),
        createdById: 'owner',
      },
    });
    const own = await getMember(db, { storeId: 'store', actorUserId: 'manager', memberId: 'm-manager' });
    expect([own.termsAccess, own.currentTerms?.hourlyWage]).toEqual(['ALLOWED', 11000]);
  });

  it('TERMS_EDIT Manager는 인증 없이도 본다', async () => {
    await db.membership.update({ where: { id: 'm-manager' }, data: { permissions: ['TERMS_EDIT'] } });
    const member = await getMember(db, { storeId: 'store', actorUserId: 'manager', memberId: 'm-b' });
    expect(member.currentTerms?.hourlyWage).toBe(10320);
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

describe('변경 이력 (staff §4.3)', () => {
  const update = (memberId: string, change: Parameters<typeof updateMember>[1]['change']) =>
    updateMember(db, { storeId: 'store', actorUserId: 'owner', memberId, change, now: NOW });
  const eventsOf = (memberId: string, actorUserId = 'owner') =>
    listMembershipEvents(db, { storeId: 'store', actorUserId, memberId });

  it('매니저로 올리고 권한을 주면 역할·권한 이력이 각각 남는다', async () => {
    await update('m-a', { role: 'MANAGER', permissions: ['PAYROLL_READ'] });
    const events = await eventsOf('m-a');
    expect(events.map((event) => [event.type, event.before, event.after, event.actorName])).toEqual(
      expect.arrayContaining([
        ['ROLE_CHANGED', { role: 'EMPLOYEE' }, { role: 'MANAGER' }, '김사장'],
        ['PERMISSIONS_CHANGED', { permissions: [] }, { permissions: ['PAYROLL_READ'] }, '김사장'],
      ]),
    );
    expect(events).toHaveLength(2);
  });

  it('직원으로 내리면 지워진 권한도 이력에 남는다', async () => {
    await db.membership.update({ where: { id: 'm-manager' }, data: { permissions: ['PAYROLL_READ', 'TERMS_EDIT'] } });
    await update('m-manager', { role: 'EMPLOYEE' });
    const events = await eventsOf('m-manager');
    expect(events.find((event) => event.type === 'PERMISSIONS_CHANGED')?.after).toEqual({ permissions: [] });
  });

  it('값이 그대로면 이력을 남기지 않는다', async () => {
    await update('m-manager', { role: 'MANAGER', permissions: [] });
    expect(await eventsOf('m-manager')).toEqual([]);
  });

  it('매니저를 퇴사 처리하면 위임 권한도 비우고 PERMISSIONS_CHANGED를 남긴다', async () => {
    await db.membership.update({ where: { id: 'm-manager' }, data: { permissions: ['PAYROLL_READ'] } });
    const member = await update('m-manager', { status: 'INACTIVE' });
    const events = await eventsOf('m-manager');
    expect(member.permissions).toEqual([]);
    expect(events.map((event) => [event.type, event.after])).toEqual(
      expect.arrayContaining([
        ['DEACTIVATED', { status: 'INACTIVE' }],
        ['PERMISSIONS_CHANGED', { permissions: [] }],
      ]),
    );
  });

  it('퇴사 처리는 DEACTIVATED, 최근 것이 먼저 온다', async () => {
    await update('m-a', { role: 'MANAGER' });
    await updateMember(db, {
      storeId: 'store',
      actorUserId: 'owner',
      memberId: 'm-a',
      change: { status: 'INACTIVE' },
      now: new Date(NOW.getTime() + 60_000),
    });
    const events = await eventsOf('m-a');
    expect(events.map((event) => [event.type, event.before, event.after])).toEqual([
      ['DEACTIVATED', { status: 'ACTIVE' }, { status: 'INACTIVE' }],
      ['ROLE_CHANGED', { role: 'EMPLOYEE' }, { role: 'MANAGER' }],
    ]);
  });

  it('근무 중이라 퇴사 처리가 막히면 이력도 남지 않는다', async () => {
    await startWork();
    await expect(update('m-b', { status: 'INACTIVE' })).rejects.toMatchObject({ code: 'MEMBER_HAS_OPEN_ATTENDANCE' });
    expect(await db.membershipEvent.count()).toBe(0);
  });

  it('사장님만 이력을 본다', async () => {
    await db.membership.update({ where: { id: 'm-manager' }, data: { permissions: ['PAYROLL_READ', 'TERMS_EDIT'] } });
    await expect(eventsOf('m-a', 'manager')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const owner = await getMember(db, { storeId: 'store', actorUserId: 'owner', memberId: 'm-a' });
    const manager = await getMember(db, { storeId: 'store', actorUserId: 'manager', memberId: 'm-a' });
    expect([owner.canViewHistory, manager.canViewHistory]).toEqual([true, false]);
  });

  it('다른 매장 직원 이력은 NOT_FOUND', async () => {
    await db.store.create({ data: { id: 'store2', name: '옆집' } });
    await db.membership.create({ data: { id: 'm-other', storeId: 'store2', userId: 'staff-a', role: 'EMPLOYEE' } });
    await expect(eventsOf('m-other')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
