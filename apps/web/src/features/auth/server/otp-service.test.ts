import type { PrismaClient } from '@chulgeunkok/db';
import { createTestDb } from '@chulgeunkok/db/testing';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getSessionUserId } from '@/server/auth/session';
import type { SmsSender } from '@/server/integrations/sms';

import { DEVICE_COOKIE } from './device';
import { getMe, updateMyName } from './me-service';
import { OTP_MAX_ATTEMPTS, OTP_RESEND_INTERVAL_MS, OTP_TTL_MS, sendOtp, verifyOtp } from './otp-service';

const PHONE = '+821012345678';
const NOW = new Date('2026-11-03T09:00:00Z');
const later = (ms: number) => new Date(NOW.getTime() + ms);

let db: PrismaClient;
let close: () => Promise<void>;
let sent: string[];
const sender: SmsSender = {
  isDev: true,
  async send(_phone, text) {
    sent.push(text);
  },
};

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  sent = [];
});

afterEach(async () => {
  await close();
});

const send = (now = NOW) => sendOtp(db, { phone: PHONE, now, sender });
const verify = (code: string, now = later(1000)) =>
  verifyOtp(db, { phone: PHONE, code, userAgent: 'test', now });
const codeOf = async (now = NOW) => (await send(now)).devCode ?? '';
const wrongCodeFor = (code: string) => (code === '000000' ? '111111' : '000000');

describe('sendOtp', () => {
  it('6자리 코드를 문자로 보내고 DB에는 해시만 남긴다', async () => {
    const code = await codeOf();
    const saved = await db.otpCode.findFirstOrThrow();
    expect([/^\d{6}$/.test(code), sent[0]?.includes(code), saved.codeHash.includes(code)]).toEqual([
      true,
      true,
      false,
    ]);
  });

  it('60초 안에 다시 받으면 OTP_RESEND_TOO_SOON', async () => {
    await send();
    await expect(send(later(30_000))).rejects.toMatchObject({ code: 'OTP_RESEND_TOO_SOON' });
  });

  it('하루 10번을 넘으면 OTP_RESEND_TOO_SOON', async () => {
    for (let index = 0; index < 10; index += 1) await send(later(index * OTP_RESEND_INTERVAL_MS));
    await expect(send(later(10 * OTP_RESEND_INTERVAL_MS))).rejects.toMatchObject({
      code: 'OTP_RESEND_TOO_SOON',
    });
  });

  it('production에서는 개발용 코드를 응답에 넣지 않는다', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const result = await send();
    vi.unstubAllEnvs();
    expect(result.devCode).toBeUndefined();
  });
});

describe('verifyOtp', () => {
  it('맞는 코드면 새 사용자와 기기를 만들고 이름을 요구한다', async () => {
    const result = await verify(await codeOf());
    const userId = await getSessionUserId(
      new NextRequest('http://localhost', { headers: { cookie: `${DEVICE_COOKIE}=${result.deviceToken}` } }),
      db,
    );
    expect([result.needsName, (await db.user.findUniqueOrThrow({ where: { id: userId } })).phone]).toEqual([
      true,
      PHONE,
    ]);
  });

  it('이미 이름이 있는 사용자는 이름을 묻지 않는다', async () => {
    await db.user.create({ data: { name: '김사장', phone: PHONE } });
    expect((await verify(await codeOf())).needsName).toBe(false);
  });

  it('한 번 쓴 코드는 다시 쓸 수 없다', async () => {
    const code = await codeOf();
    await verify(code);
    await expect(verify(code)).rejects.toMatchObject({ code: 'OTP_EXPIRED' });
  });

  it('3분이 지나면 OTP_EXPIRED', async () => {
    const code = await codeOf();
    await expect(verify(code, later(OTP_TTL_MS))).rejects.toMatchObject({ code: 'OTP_EXPIRED' });
  });

  it('새 코드를 받으면 이전 코드는 쓸 수 없다', async () => {
    const first = await codeOf();
    const second = await codeOf(later(OTP_RESEND_INTERVAL_MS));
    if (first === second) return; // 같은 숫자가 나온 드문 경우
    await expect(verify(first, later(OTP_RESEND_INTERVAL_MS + 1000))).rejects.toMatchObject({
      code: 'OTP_INVALID',
    });
  });

  it('틀린 코드는 OTP_INVALID이고 시도 횟수가 남는다', async () => {
    const code = await codeOf();
    await expect(verify(wrongCodeFor(code))).rejects.toMatchObject({ code: 'OTP_INVALID' });
    expect((await db.otpCode.findFirstOrThrow()).attempts).toBe(1);
  });

  it('5번 틀리면 맞는 코드도 쓸 수 없다', async () => {
    const code = await codeOf();
    for (let index = 0; index < OTP_MAX_ATTEMPTS; index += 1) {
      await verify(wrongCodeFor(code)).catch(() => undefined);
    }
    await expect(verify(code)).rejects.toMatchObject({ code: 'OTP_EXPIRED' });
  });
});

describe('getMe · updateMyName', () => {
  it('이름을 저장하면 다시 묻지 않는다', async () => {
    const result = await verify(await codeOf());
    const user = await db.user.findUniqueOrThrow({ where: { phone: PHONE } });
    const me = await updateMyName(db, { userId: user.id, name: '김사장' });
    expect([me.user.name, result.needsName]).toEqual(['김사장', true]);
  });

  it('이름이 없으면 null로 보여 준다', async () => {
    await verify(await codeOf());
    const user = await db.user.findUniqueOrThrow({ where: { phone: PHONE } });
    expect((await getMe(db, user.id)).user.name).toBeNull();
  });
});
