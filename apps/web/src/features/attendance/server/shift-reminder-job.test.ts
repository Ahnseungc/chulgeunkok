import type { PrismaClient } from '@chulgeunkok/db';
import { createTestDb } from '@chulgeunkok/db/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { PushMessage, PushSender } from '@/server/integrations/push';

import { runShiftReminderJob } from './shift-reminder-job';

const kst = (local: string) => new Date(`${local}+09:00`);
const TOKEN = 'token-staff';

interface FakePush extends PushSender {
  sent: [string, PushMessage][];
}

const fakePush = (result: 'SENT' | 'TOKEN_INVALID' = 'SENT'): FakePush => {
  const sent: [string, PushMessage][] = [];
  return {
    sent,
    send: async (token, message) => {
      sent.push([token, message]);
      return result;
    },
  };
};

let db: PrismaClient;
let close: () => Promise<void>;

/** 월요일(11/16) 18:00 출근, workMinutes 뒤 퇴근 */
const createTerms = (input: { startMinute?: number; workMinutes?: number; scheduleVaries?: boolean } = {}) =>
  db.employmentTerms.create({
    data: {
      id: 'terms',
      membershipId: 'm-staff',
      version: 1,
      effectiveFrom: kst('2026-10-01T00:00:00'),
      hourlyWage: 10320,
      contractStartDate: new Date('2026-10-01'),
      createdById: 'owner',
      scheduleVaries: input.scheduleVaries ?? false,
      schedules: { create: [{ weekday: 1, startMinute: input.startMinute ?? 18 * 60, workMinutes: input.workMinutes ?? 300 }] },
    },
  });

const createAttendance = (input: { clockInAt: string; clockOutAt?: string }) =>
  db.attendance.create({
    data: {
      storeId: 'store',
      membershipId: 'm-staff',
      termsId: 'terms',
      clockInAt: kst(input.clockInAt),
      clockOutAt: input.clockOutAt ? kst(input.clockOutAt) : null,
      status: input.clockOutAt ? 'CLOSED' : 'OPEN',
    },
  });

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  await db.user.createMany({ data: [{ id: 'owner', name: '김사장' }, { id: 'staff', name: '이알바' }] });
  await db.store.create({ data: { id: 'store', name: '골목카페' } });
  await db.membership.createMany({
    data: [
      { id: 'm-owner', storeId: 'store', userId: 'owner', role: 'OWNER' },
      { id: 'm-staff', storeId: 'store', userId: 'staff', role: 'EMPLOYEE' },
    ],
  });
  await db.deviceCredential.create({
    data: { id: 'dc', userId: 'staff', tokenHash: 'hash', pushToken: { create: { userId: 'staff', token: TOKEN, platform: 'ios' } } },
  });
});

afterEach(async () => {
  await close();
});

const run = async (local: string, push: FakePush = fakePush()) => {
  const result = await runShiftReminderJob(db, kst(local), push);
  return { result, messages: push.sent.map(([, message]) => message) };
};

describe('runShiftReminderJob', () => {
  beforeEach(async () => {
    await createTerms();
  });

  it('출근 10분 전: 매장명·출근 시각, 탭하면 /me', async () => {
    const { messages } = await run('2026-11-16T17:52:00');
    expect(messages).toEqual([{ title: '10분 뒤 출근이에요', body: '골목카페 · 18:00 출근', path: '/me' }]);
  });

  it('출근 시각', async () => {
    const { messages } = await run('2026-11-16T18:00:00');
    expect(messages).toEqual([{ title: '출근 시간이에요', body: '매장 QR을 찍어 출근을 남겨 주세요', path: '/me' }]);
  });

  it('근무 중이면 퇴근 10분 전·퇴근 시각', async () => {
    await createAttendance({ clockInAt: '2026-11-16T17:58:00' });
    const soon = await run('2026-11-16T22:50:00');
    const now = await run('2026-11-16T23:03:00');
    expect([...soon.messages, ...now.messages]).toEqual([
      { title: '10분 뒤 퇴근이에요', body: '골목카페 · 23:00 퇴근', path: '/me' },
      { title: '퇴근 시간이에요', body: '퇴근을 찍어 주세요', path: '/me' },
    ]);
  });

  it('다음 실행에서 같은 알림을 다시 보내지 않는다', async () => {
    const first = await run('2026-11-16T17:52:00');
    const second = await run('2026-11-16T17:54:00');
    expect([first.messages.length, second.messages.length, second.result.skipped, await db.shiftReminder.count()]).toEqual([1, 0, 1, 1]);
  });

  it('이미 출근했으면 출근 알림을 건너뛴다', async () => {
    await createAttendance({ clockInAt: '2026-11-16T17:40:00' });
    const { result, messages } = await run('2026-11-16T17:52:00');
    expect([messages, result.skipped, await db.shiftReminder.count()]).toEqual([[], 1, 0]);
  });

  it('일찍 출근하고 퇴근했어도 출근 알림을 건너뛴다', async () => {
    await createAttendance({ clockInAt: '2026-11-16T16:30:00', clockOutAt: '2026-11-16T17:50:00' });
    const { messages } = await run('2026-11-16T18:00:00');
    expect(messages).toEqual([]);
  });

  it('근무 중이 아니면 퇴근 알림을 건너뛴다', async () => {
    const { result, messages } = await run('2026-11-16T22:50:00');
    expect([messages, result.skipped]).toEqual([[], 1]);
  });

  it('그날 스케줄이 없으면 아무것도 안 보낸다', async () => {
    const { result } = await run('2026-11-17T17:52:00');
    expect(result.due).toBe(0);
  });

  it('비활성 직원에겐 안 보낸다', async () => {
    await db.membership.update({ where: { id: 'm-staff' }, data: { status: 'INACTIVE' } });
    const { result } = await run('2026-11-16T17:52:00');
    expect(result.due).toBe(0);
  });

  it('기기가 없어도 기록은 남기고 멈추지 않는다', async () => {
    await db.deviceCredential.delete({ where: { id: 'dc' } });
    const { result, messages } = await run('2026-11-16T17:52:00');
    expect([result.sent, messages.length, await db.shiftReminder.count()]).toEqual([1, 0, 1]);
  });

  it('더 못 쓰는 토큰은 지운다', async () => {
    await run('2026-11-16T17:52:00', fakePush('TOKEN_INVALID'));
    expect(await db.pushToken.count()).toBe(0);
  });

  it('발송이 실패해도 던지지 않고 기록은 그대로', async () => {
    const failing: FakePush = { sent: [], send: async () => Promise.reject(new Error('fcm down')) };
    const { result } = await run('2026-11-16T17:52:00', failing);
    expect([result.sent, result.failed, await db.shiftReminder.count()]).toEqual([1, 0, 1]);
  });
});

describe('runShiftReminderJob 스케줄 변형', () => {
  it('자정 넘는 근무는 다음 날 퇴근 알림', async () => {
    await createTerms({ startMinute: 22 * 60, workMinutes: 360 });
    await createAttendance({ clockInAt: '2026-11-16T22:00:00' });
    const { messages } = await run('2026-11-17T03:51:00');
    expect(messages).toEqual([{ title: '10분 뒤 퇴근이에요', body: '골목카페 · 04:00 퇴근', path: '/me' }]);
  });

  it('주마다 다른 스케줄이면 안 보낸다', async () => {
    await createTerms({ scheduleVaries: true });
    const { result } = await run('2026-11-16T17:52:00');
    expect(result.due).toBe(0);
  });
});
