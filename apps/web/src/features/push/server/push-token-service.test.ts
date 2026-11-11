import type { PrismaClient } from '@chulgeunkok/db';
import { createTestDb } from '@chulgeunkok/db/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { registerDevice, revokeDeviceToken, revokeUserDevices } from '@/features/auth/server/device';

import { registerPushToken } from './push-token-service';

let db: PrismaClient;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  await db.user.createMany({
    data: [
      { id: 'u1', name: '이알바' },
      { id: 'u2', name: '박알바' },
    ],
  });
});

afterEach(async () => {
  await close();
});

const NOW = new Date('2026-12-03T12:00:00+09:00');
const device = (userId = 'u1') => registerDevice(db, { userId, userAgent: null });
const register = (deviceToken: string, token: string) => registerPushToken(db, { deviceToken, token, platform: 'ios' });

describe('registerPushToken', () => {
  it('같은 기기 토큰 재등록은 갱신', async () => {
    const deviceToken = await device();
    await register(deviceToken, 'fcm-1');
    await register(deviceToken, 'fcm-2');
    expect((await db.pushToken.findMany()).map((p) => p.token)).toEqual(['fcm-2']);
  });

  it('같은 토큰이 다른 기기에 있으면 그 행을 지우고 옮긴다', async () => {
    const first = await device('u1');
    const second = await device('u2');
    await register(first, 'fcm-1');
    await register(second, 'fcm-1');
    expect((await db.pushToken.findMany()).map((p) => p.userId)).toEqual(['u2']);
  });

  it('없거나 폐기된 기기 토큰이면 UNAUTHENTICATED', async () => {
    await expect(register('unknown', 'fcm-1')).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    const deviceToken = await device();
    await revokeDeviceToken(db, { token: deviceToken, now: NOW });
    await expect(register(deviceToken, 'fcm-1')).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });
});

describe('기기 폐기와 푸시 토큰', () => {
  it('기기 재등록하면 이전 기기 푸시 토큰이 지워진다', async () => {
    const old = await device();
    await register(old, 'fcm-old');
    await revokeUserDevices(db, { userId: 'u1', now: NOW });
    expect(await db.pushToken.count()).toBe(0);
  });

  it('로그아웃하면 그 기기 푸시 토큰만 지워진다', async () => {
    const first = await device('u1');
    const second = await device('u2');
    await register(first, 'fcm-1');
    await register(second, 'fcm-2');
    await revokeDeviceToken(db, { token: first, now: NOW });
    expect((await db.pushToken.findMany()).map((p) => p.token)).toEqual(['fcm-2']);
  });
});
