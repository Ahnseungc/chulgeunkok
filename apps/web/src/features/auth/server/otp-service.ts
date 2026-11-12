import { createHash, randomInt } from 'node:crypto';

import type { Prisma, PrismaClient } from '@chulgeunkok/db';

import type { SmsSender } from '@/server/integrations/sms';
import { ApiError } from '@/server/http/api-error';

import { registerDevice } from './device';

/** docs/specs/auth §4 */
export const OTP_TTL_MS = 3 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_INTERVAL_MS = 60 * 1000;
export const OTP_DAILY_LIMIT = 10;
const DAY_MS = 24 * 60 * 60 * 1000;
const CODE_DIGITS = 6;

/** 이름을 아직 받지 않은 사용자. User.name이 필수 컬럼이라 빈 문자열로 표시한다 */
export const PENDING_NAME = '';

const hashCode = (phone: string, code: string) =>
  createHash('sha256').update(`${phone}:${code}`).digest('hex');

const generateCode = () => String(randomInt(0, 10 ** CODE_DIGITS)).padStart(CODE_DIGITS, '0');

/** POST /auth/otp/send — 이전 미사용 코드는 닫고 새 코드만 유효하게 둔다 */
export async function sendOtp(
  db: PrismaClient,
  input: { phone: string; now: Date; sender: SmsSender },
): Promise<{ expiresAt: string; devCode?: string }> {
  await assertCanSend(db, input);
  const code = generateCode();
  const expiresAt = new Date(input.now.getTime() + OTP_TTL_MS);
  await db.$transaction([
    db.otpCode.updateMany({
      where: { phone: input.phone, consumedAt: null },
      data: { consumedAt: input.now },
    }),
    db.otpCode.create({
      // 재발송 간격은 createdAt으로 판단하므로 DB 시계가 아니라 같은 기준 시각을 쓴다
      data: {
        phone: input.phone,
        codeHash: hashCode(input.phone, code),
        expiresAt,
        createdAt: input.now,
      },
    }),
  ]);
  await input.sender.send(input.phone, `[출근콕] 인증번호 ${code} (3분 안에 입력해 주세요)`);

  const exposeDevCode = input.sender.isDev && process.env.NODE_ENV !== 'production';
  return { expiresAt: expiresAt.toISOString(), ...(exposeDevCode ? { devCode: code } : {}) };
}

async function assertCanSend(db: PrismaClient, input: { phone: string; now: Date }) {
  const latest = await db.otpCode.findFirst({
    where: { phone: input.phone },
    orderBy: { createdAt: 'desc' },
  });
  if (latest && input.now.getTime() - latest.createdAt.getTime() < OTP_RESEND_INTERVAL_MS) {
    throw new ApiError('OTP_RESEND_TOO_SOON');
  }
  const sentToday = await db.otpCode.count({
    where: { phone: input.phone, createdAt: { gt: new Date(input.now.getTime() - DAY_MS) } },
  });
  if (sentToday >= OTP_DAILY_LIMIT) throw new ApiError('OTP_RESEND_TOO_SOON');
}

/**
 * POST /auth/otp/verify — 성공하면 그 번호의 사용자로 기기를 등록한다.
 * `attachToUserId`가 있으면 기기를 새로 만들지 않고 그 사용자(지금 기기 세션)에 번호만 붙인다 (§4.2).
 * 틀린 시도는 트랜잭션 밖에서 기록해야 예외로 끝나도 시도 횟수가 남는다.
 */
export async function verifyOtp(
  db: PrismaClient,
  input: { phone: string; code: string; userAgent: string | null; now: Date; attachToUserId?: string | null },
): Promise<{ deviceToken: string | null; needsName: boolean }> {
  const otp = await db.otpCode.findFirst({
    where: { phone: input.phone, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (!otp || otp.expiresAt <= input.now) throw new ApiError('OTP_EXPIRED');
  if (otp.attempts >= OTP_MAX_ATTEMPTS) throw new ApiError('OTP_TOO_MANY_ATTEMPTS');
  if (otp.codeHash !== hashCode(input.phone, input.code)) {
    await recordFailedAttempt(db, { id: otp.id, attempts: otp.attempts, now: input.now });
  }

  return db.$transaction(async (tx) => {
    const consumed = await tx.otpCode.updateMany({
      where: { id: otp.id, consumedAt: null },
      data: { consumedAt: input.now },
    });
    if (consumed.count === 0) throw new ApiError('OTP_EXPIRED');
    if (input.attachToUserId) return attachPhone(tx, { userId: input.attachToUserId, phone: input.phone });
    const user = await tx.user.upsert({
      where: { phone: input.phone },
      create: { phone: input.phone, name: PENDING_NAME },
      update: {},
    });
    const deviceToken = await registerDevice(tx, { userId: user.id, userAgent: input.userAgent });
    return { deviceToken, needsName: user.name === PENDING_NAME };
  });
}

/**
 * 초대로 등록한 Manager가 급여를 보려고 번호를 인증할 때 (§4.2). 기기·세션은 그대로 두고 번호만 붙인다.
 * 그 번호가 다른 사람 것이면 합치지 않는다 (§4 "번호가 없던 User와는 합치지 않는다").
 */
async function attachPhone(
  tx: Prisma.TransactionClient,
  input: { userId: string; phone: string },
): Promise<{ deviceToken: null; needsName: boolean }> {
  const owner = await tx.user.findUnique({ where: { phone: input.phone }, select: { id: true } });
  if (owner && owner.id !== input.userId) throw new ApiError('PHONE_IN_USE');
  const user = await tx.user.update({ where: { id: input.userId }, data: { phone: input.phone } });
  return { deviceToken: null, needsName: user.name === PENDING_NAME };
}

async function recordFailedAttempt(
  db: PrismaClient,
  input: { id: string; attempts: number; now: Date },
): Promise<never> {
  const attempts = input.attempts + 1;
  const exhausted = attempts >= OTP_MAX_ATTEMPTS;
  await db.otpCode.update({
    where: { id: input.id },
    data: { attempts, ...(exhausted ? { consumedAt: input.now } : {}) },
  });
  throw new ApiError(exhausted ? 'OTP_TOO_MANY_ATTEMPTS' : 'OTP_INVALID');
}
