import type { PrismaClient } from '@chulgeunkok/db';
import { createTestDb } from '@chulgeunkok/db/testing';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getSessionUserId } from '@/server/auth/session';

import { createHandoffCode, HANDOFF_TTL_MS, redeemHandoffCode, safeRestorePath } from './handoff-service';

const NOW = new Date('2026-11-04T03:00:00Z');

let db: PrismaClient;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  await db.user.create({ data: { id: 'staff', name: '이알바' } });
});

afterEach(async () => {
  await close();
});

const redeem = (code: string, now = NOW) => redeemHandoffCode(db, { code, userAgent: 'app', now });

describe('handoff', () => {
  it('코드로 같은 사람의 새 기기 토큰을 받고, 그 토큰이 Bearer 세션이 된다', async () => {
    const { code } = await createHandoffCode(db, { userId: 'staff', now: NOW });
    const { deviceToken } = await redeem(code);
    const userId = await getSessionUserId(new NextRequest('http://x', { headers: { authorization: `Bearer ${deviceToken}` } }), db);
    expect(userId).toBe('staff');
  });

  it('한 번 쓴 코드는 HANDOFF_INVALID', async () => {
    const { code } = await createHandoffCode(db, { userId: 'staff', now: NOW });
    await redeem(code);
    await expect(redeem(code)).rejects.toMatchObject({ code: 'HANDOFF_INVALID' });
  });

  it('60초가 지나면 HANDOFF_INVALID', async () => {
    const { code } = await createHandoffCode(db, { userId: 'staff', now: NOW });
    await expect(redeem(code, new Date(NOW.getTime() + HANDOFF_TTL_MS))).rejects.toMatchObject({ code: 'HANDOFF_INVALID' });
  });

  it('없는 코드는 HANDOFF_INVALID', async () => {
    await expect(redeem('x'.repeat(43))).rejects.toMatchObject({ code: 'HANDOFF_INVALID' });
  });

  it('DB에는 코드 원문이 없다', async () => {
    const { code } = await createHandoffCode(db, { userId: 'staff', now: NOW });
    expect((await db.deviceHandoffCode.findFirstOrThrow()).codeHash).not.toBe(code);
  });
});

describe('safeRestorePath', () => {
  it.each([
    ['/me', '/me'],
    ['/p/abc_DEF-123', '/p/abc_DEF-123'],
    ['/owner/store/members', '/owner/store/members'],
    ['//evil.example', '/me'],
    ['https://evil.example', '/me'],
    ['/api/v1/me', '/me'],
    [null, '/me'],
  ])('%s → %s', (next, expected) => {
    expect(safeRestorePath(next)).toBe(expected);
  });
});
