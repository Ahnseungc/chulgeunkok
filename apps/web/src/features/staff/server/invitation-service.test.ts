import type { PrismaClient } from '@chulgeunkok/db';
import { createTestDb } from '@chulgeunkok/db/testing';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DEVICE_COOKIE } from '@/features/auth/server/device';
import { getSessionUserId } from '@/server/auth/session';

import {
  acceptInvitation,
  createInvitation,
  getInvitationInfo,
  INVITATION_TTL_MS,
} from './invitation-service';

const NOW = new Date('2026-11-03T09:00:00Z');
const ORIGIN = 'https://chulgeunkok.test';

let db: PrismaClient;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  await db.user.createMany({
    data: [
      { id: 'owner', name: '김사장' },
      { id: 'manager', name: '최매니저' },
      { id: 'staff', name: '이알바' },
    ],
  });
  await db.store.createMany({ data: [{ id: 'store', name: '골목카페' }, { id: 'store2', name: '옆집' }] });
  await db.membership.createMany({
    data: [
      { id: 'm-owner', storeId: 'store', userId: 'owner', role: 'OWNER' },
      { id: 'm-manager', storeId: 'store', userId: 'manager', role: 'MANAGER' },
      { id: 'm-staff', storeId: 'store', userId: 'staff', role: 'EMPLOYEE' },
      { id: 'm-owner2', storeId: 'store2', userId: 'owner', role: 'OWNER' },
    ],
  });
});

afterEach(async () => {
  await close();
});

const tokenOf = (url: string) => url.split('/invite/')[1] ?? '';

async function invite(
  body: Parameters<typeof createInvitation>[1]['body'],
  options: { actorUserId?: string; storeId?: string } = {},
) {
  const { url } = await createInvitation(db, {
    storeId: options.storeId ?? 'store',
    actorUserId: options.actorUserId ?? 'owner',
    body,
    origin: ORIGIN,
    now: NOW,
  });
  return tokenOf(url);
}

const accept = (token: string, overrides: Partial<Parameters<typeof acceptInvitation>[1]> = {}) =>
  acceptInvitation(db, {
    token,
    sessionUserId: null,
    name: '박신입',
    userAgent: 'test',
    now: NOW,
    ...overrides,
  });

/** 쿠키·헤더로 세션을 판정한다 */
const sessionOf = (headers: Record<string, string>) =>
  getSessionUserId(new NextRequest('http://localhost/api', { headers }), db);

describe('createInvitation', () => {
  it('초대 URL을 만들고 토큰 원문은 저장하지 않는다', async () => {
    const token = await invite({ kind: 'JOIN', role: 'EMPLOYEE', delivery: 'QR' });
    const saved = await db.storeInvitation.findFirstOrThrow();
    expect([token.length, saved.tokenHash === token]).toEqual([43, false]);
  });

  it('Manager는 Manager를 초대할 수 없다', async () => {
    const created = invite({ kind: 'JOIN', role: 'MANAGER', delivery: 'QR' }, { actorUserId: 'manager' });
    await expect(created).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('사장님 기기는 재등록 초대로 바꿀 수 없다', async () => {
    const created = invite({ kind: 'REREGISTER', memberId: 'm-owner', delivery: 'QR' });
    await expect(created).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('다른 매장 직원은 재등록 대상이 될 수 없다', async () => {
    const created = invite({ kind: 'REREGISTER', memberId: 'm-staff', delivery: 'QR' }, { storeId: 'store2' });
    await expect(created).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('직원은 초대를 만들 수 없다', async () => {
    const created = invite({ kind: 'JOIN', role: 'EMPLOYEE', delivery: 'QR' }, { actorUserId: 'staff' });
    await expect(created).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('getInvitationInfo', () => {
  it('미등록 기기의 새 직원 초대는 이름이 필요하다', async () => {
    const token = await invite({ kind: 'JOIN', role: 'EMPLOYEE', delivery: 'QR' });
    const info = await getInvitationInfo(db, { token, sessionUserId: null, now: NOW });
    expect(info).toMatchObject({ kind: 'JOIN', storeName: '골목카페', inviterName: '김사장', needsName: true });
  });

  it('재등록 초대는 대상 직원 이름을 보여 준다', async () => {
    const token = await invite({ kind: 'REREGISTER', memberId: 'm-staff', delivery: 'QR' });
    const info = await getInvitationInfo(db, { token, sessionUserId: null, now: NOW });
    expect(info).toMatchObject({ kind: 'REREGISTER', memberName: '이알바', needsName: false });
  });

  it('링크 초대는 10분이 지나도 유효하다', async () => {
    const token = await invite({ kind: 'JOIN', role: 'EMPLOYEE', delivery: 'LINK' });
    const later = new Date(NOW.getTime() + INVITATION_TTL_MS.QR);
    expect((await getInvitationInfo(db, { token, sessionUserId: null, now: later })).kind).toBe('JOIN');
  });

  it('QR 초대는 10분 뒤 INVITATION_EXPIRED', async () => {
    const token = await invite({ kind: 'JOIN', role: 'EMPLOYEE', delivery: 'QR' });
    const later = new Date(NOW.getTime() + INVITATION_TTL_MS.QR);
    await expect(getInvitationInfo(db, { token, sessionUserId: null, now: later })).rejects.toMatchObject({
      code: 'INVITATION_EXPIRED',
    });
  });
});

describe('acceptInvitation — 새 직원', () => {
  it('사람·직원·기기를 만들고, 그 기기 토큰이 세션이 된다', async () => {
    const result = await accept(await invite({ kind: 'JOIN', role: 'EMPLOYEE', delivery: 'QR' }));
    const userId = await sessionOf({ cookie: `${DEVICE_COOKIE}=${result.deviceToken}` });
    const member = await db.membership.findUniqueOrThrow({
      where: { storeId_userId: { storeId: 'store', userId } },
      include: { user: true },
    });
    expect([member.user.name, member.role]).toEqual(['박신입', 'EMPLOYEE']);
  });

  it('앱 네이티브 호출은 Bearer 헤더로도 같은 세션이다', async () => {
    const result = await accept(await invite({ kind: 'JOIN', role: 'EMPLOYEE', delivery: 'QR' }));
    const fromCookie = await sessionOf({ cookie: `${DEVICE_COOKIE}=${result.deviceToken}` });
    const fromBearer = await sessionOf({ authorization: `Bearer ${result.deviceToken}` });
    expect(fromBearer).toBe(fromCookie);
  });

  it('미등록 기기에서 이름이 없으면 VALIDATION_FAILED', async () => {
    const accepted = accept(await invite({ kind: 'JOIN', role: 'EMPLOYEE', delivery: 'QR' }), { name: undefined });
    await expect(accepted).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('이름이 없어 실패하면 초대가 소모되지 않는다', async () => {
    const token = await invite({ kind: 'JOIN', role: 'EMPLOYEE', delivery: 'QR' });
    await accept(token, { name: undefined }).catch(() => undefined);
    expect((await accept(token)).storeName).toBe('골목카페');
  });

  it('이미 등록된 기기는 같은 사람으로 다른 매장에 합류하고 새 기기를 만들지 않는다', async () => {
    const result = await accept(await invite({ kind: 'JOIN', role: 'EMPLOYEE', delivery: 'QR' }, { storeId: 'store2' }), {
      sessionUserId: 'staff',
      name: undefined,
    });
    expect([result.deviceToken, await db.membership.count({ where: { userId: 'staff' } })]).toEqual([null, 2]);
  });

  it('이미 이 매장 직원이면 ALREADY_MEMBER', async () => {
    const accepted = accept(await invite({ kind: 'JOIN', role: 'EMPLOYEE', delivery: 'QR' }), { sessionUserId: 'staff' });
    await expect(accepted).rejects.toMatchObject({ code: 'ALREADY_MEMBER' });
  });

  it('한 번 수락한 초대는 INVITATION_USED', async () => {
    const token = await invite({ kind: 'JOIN', role: 'EMPLOYEE', delivery: 'QR' });
    await accept(token);
    await expect(accept(token)).rejects.toMatchObject({ code: 'INVITATION_USED' });
  });

  it('동시에 수락해도 1명만 합류한다', async () => {
    const token = await invite({ kind: 'JOIN', role: 'EMPLOYEE', delivery: 'QR' });
    const results = await Promise.allSettled([accept(token), accept(token, { name: '다른사람' })]);
    expect(results.map((result) => result.status).sort()).toEqual(['fulfilled', 'rejected']);
  });
});

describe('acceptInvitation — 기기 재등록', () => {
  it('이전 기기는 폐기되고 새 기기만 세션이 된다', async () => {
    const first = await accept(await invite({ kind: 'REREGISTER', memberId: 'm-staff', delivery: 'QR' }));
    const second = await accept(await invite({ kind: 'REREGISTER', memberId: 'm-staff', delivery: 'QR' }));
    await expect(sessionOf({ cookie: `${DEVICE_COOKIE}=${first.deviceToken}` })).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
    expect(await sessionOf({ cookie: `${DEVICE_COOKIE}=${second.deviceToken}` })).toBe('staff');
  });

  it('퇴사한 직원은 다시 ACTIVE가 된다', async () => {
    await db.membership.update({ where: { id: 'm-staff' }, data: { status: 'INACTIVE', leftAt: NOW } });
    await accept(await invite({ kind: 'REREGISTER', memberId: 'm-staff', delivery: 'QR' }));
    const member = await db.membership.findUniqueOrThrow({ where: { id: 'm-staff' } });
    expect([member.status, member.leftAt]).toEqual(['ACTIVE', null]);
  });

  it('재등록은 새 사람을 만들지 않는다', async () => {
    const token = await invite({ kind: 'REREGISTER', memberId: 'm-staff', delivery: 'QR' });
    const before = await db.user.count();
    await accept(token);
    expect(await db.user.count()).toBe(before);
  });
});
