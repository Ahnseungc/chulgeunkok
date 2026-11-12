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

describe('verifyOtp — 지금 세션에 번호 붙이기 (auth §4.2)', () => {
  const attach = (code: string, userId = 'manager') =>
    verifyOtp(db, { phone: PHONE, code, userAgent: 'test', now: later(1000), attachToUserId: userId });
  const phoneOf = async (id: string) => (await db.user.findUniqueOrThrow({ where: { id } })).phone;

  beforeEach(async () => {
    await db.user.createMany({
      data: [
        { id: 'manager', name: '최매니저' },
        { id: 'plain-manager', name: '정매니저' },
        { id: 'staff', name: '이알바' },
        { id: 'owner', name: '김사장', phone: '+821000000001' },
      ],
    });
    await db.store.create({ data: { id: 'store', name: '골목카페' } });
    await db.membership.createMany({
      data: [
        { storeId: 'store', userId: 'manager', role: 'MANAGER', permissions: ['PAYROLL_READ'] },
        { storeId: 'store', userId: 'plain-manager', role: 'MANAGER', permissions: ['TERMS_EDIT'] },
        { storeId: 'store', userId: 'staff', role: 'EMPLOYEE' },
        { storeId: 'store', userId: 'owner', role: 'OWNER' },
      ],
    });
  });

  it('급여 권한 Manager에게 기기를 새로 만들지 않고 번호만 붙인다', async () => {
    const result = await attach(await codeOf());
    expect([result, await phoneOf('manager'), await db.user.count({ where: { phone: PHONE } }), await db.deviceCredential.count()]).toEqual([
      { deviceToken: null, needsName: false },
      PHONE,
      1,
      0,
    ]);
  });

  it('이미 번호가 있으면 바꾸지 않고 PHONE_ALREADY_SET (사장님 기기 쿠키로 번호를 옮기지 못한다)', async () => {
    await expect(attach(await codeOf(), 'owner')).rejects.toMatchObject({ code: 'PHONE_ALREADY_SET' });
    expect(await phoneOf('owner')).toBe('+821000000001');
  });

  it('같은 번호로 다시 하면 그대로 둔다', async () => {
    await db.user.update({ where: { id: 'manager' }, data: { phone: PHONE } });
    await expect(attach(await codeOf())).resolves.toEqual({ deviceToken: null, needsName: false });
  });

  it('직원 세션은 FORBIDDEN (OTP로 기기를 늘리지 못한다)', async () => {
    await expect(attach(await codeOf(), 'staff')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(await phoneOf('staff')).toBeNull();
  });

  it('급여 권한 없는 Manager는 FORBIDDEN', async () => {
    await expect(attach(await codeOf(), 'plain-manager')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('비활성 매장의 급여 권한만 있으면 FORBIDDEN', async () => {
    await db.membership.updateMany({ where: { userId: 'manager' }, data: { status: 'INACTIVE' } });
    await expect(attach(await codeOf())).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('다른 사람 번호면 PHONE_IN_USE이고 합치지 않는다', async () => {
    await db.user.create({ data: { id: 'other', name: '남', phone: PHONE } });
    await expect(attach(await codeOf())).rejects.toMatchObject({ code: 'PHONE_IN_USE' });
    expect(await phoneOf('manager')).toBeNull();
  });

  it('읽은 뒤 다른 요청이 먼저 번호를 넣었으면 덮어쓰지 않고 PHONE_ALREADY_SET', async () => {
    const code = await codeOf();
    const transaction = db.$transaction.bind(db) as unknown as (fn: (tx: typeof db) => Promise<unknown>) => Promise<unknown>;
    // 읽기(번호 없음 확인) 뒤 쓰기 전에 다른 요청이 번호를 넣은 상황
    const spy = vi.spyOn(db, '$transaction').mockImplementationOnce(((fn: (tx: typeof db) => Promise<unknown>) =>
      transaction(async (tx) => {
        const findMany = tx.membership.findMany.bind(tx.membership);
        tx.membership.findMany = (async (args: never) => {
          const rows = await findMany(args);
          await tx.user.update({ where: { id: 'manager' }, data: { phone: '+821000000007' } });
          return rows;
        }) as never;
        return fn(tx);
      })) as never);
    await expect(attach(code)).rejects.toMatchObject({ code: 'PHONE_ALREADY_SET' });
    spy.mockRestore();
  });

  it('틀린 코드면 번호를 붙이지 않는다', async () => {
    const code = await codeOf();
    await expect(attach(wrongCodeFor(code))).rejects.toMatchObject({ code: 'OTP_INVALID' });
    expect(await phoneOf('manager')).toBeNull();
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
