import { Prisma, type PrismaClient } from '@chulgeunkok/db';

import { addDays, localMidnight, toLocalDate } from '@/features/payroll/model/work-time';
import { getPushSender, type PushMessage, type PushSender } from '@/server/integrations/push';
import { notifyDevices } from '@/server/integrations/push-devices';

import { dueShiftReminders, formatLocalClock, type ShiftReminderSlot } from '../model/shift-reminders';

const HOUR_MS = 60 * 60 * 1000;
/** 소정 출근 2시간 전부터 찍은 출근은 "이미 출근함"으로 본다 (docs/specs/notifications §6) */
const EARLY_CLOCK_IN_MS = 2 * HOUR_MS;
/** 알림 탭 경로 (§3) */
const REMINDER_PATH = '/me';
const LOG_TAG = 'shift-reminder';

type Outcome = 'sent' | 'skipped' | 'failed';

interface ReminderTarget {
  membershipId: string;
  storeName: string;
  tokens: string[];
}

/** §3 문구 */
export function shiftReminderMessage(slot: ShiftReminderSlot, storeName: string): PushMessage {
  const copy: Record<ShiftReminderSlot['kind'], Omit<PushMessage, 'path'>> = {
    START_SOON: { title: '10분 뒤 출근이에요', body: `${storeName} · ${formatLocalClock(slot.shift.startAt)} 출근` },
    START_NOW: { title: '출근 시간이에요', body: '매장 QR을 찍어 출근을 남겨 주세요' },
    END_SOON: { title: '10분 뒤 퇴근이에요', body: `${storeName} · ${formatLocalClock(slot.shift.endAt)} 퇴근` },
    END_NOW: { title: '퇴근 시간이에요', body: '퇴근을 찍어 주세요' },
  };
  return { ...copy[slot.kind], path: REMINDER_PATH };
}

/**
 * 5분 주기: (지금 − 5분, 지금] 에 도래한 출퇴근 알림을 보낸다 (docs/specs/notifications).
 * 직원 한 명의 실패는 로그만 남기고 다음 직원으로 넘어간다.
 */
export async function runShiftReminderJob(
  db: PrismaClient,
  now: Date,
  push: PushSender = getPushSender(),
): Promise<{ due: number; sent: number; skipped: number; failed: number }> {
  const totals = { due: 0, sent: 0, skipped: 0, failed: 0 };
  for (const member of await findCandidates(db, now)) {
    const target = { membershipId: member.id, storeName: member.store.name, tokens: member.user.pushTokens.map((row) => row.token) };
    for (const slot of dueShiftReminders(member.employmentTerms, now)) {
      totals.due += 1;
      totals[await remindSafely(db, { target, slot, now, push })] += 1;
    }
  }
  return totals;
}

/** ACTIVE·비 Owner 중 어제~내일에 걸친 고정 스케줄 근로조건이 있는 소속 (§4) */
function findCandidates(db: PrismaClient, now: Date) {
  const today = toLocalDate(now);
  const termsFilter = {
    scheduleVaries: false,
    effectiveFrom: { lt: localMidnight(addDays(today, 2)) },
    OR: [{ effectiveTo: null }, { effectiveTo: { gt: localMidnight(addDays(today, -1)) } }],
  };
  return db.membership.findMany({
    where: { status: 'ACTIVE', role: { not: 'OWNER' }, employmentTerms: { some: termsFilter } },
    include: {
      store: { select: { name: true } },
      user: { select: { pushTokens: { select: { token: true } } } },
      employmentTerms: { where: termsFilter, include: { schedules: true } },
    },
  });
}

async function remindSafely(
  db: PrismaClient,
  input: { target: ReminderTarget; slot: ShiftReminderSlot; now: Date; push: PushSender },
): Promise<Outcome> {
  try {
    return await remind(db, input);
  } catch (error) {
    console.error(`[${LOG_TAG}] 알림 처리 실패`, input.target.membershipId, input.slot.kind, error);
    return 'failed';
  }
}

async function remind(db: PrismaClient, input: { target: ReminderTarget; slot: ShiftReminderSlot; now: Date; push: PushSender }): Promise<Outcome> {
  const { target, slot, now } = input;
  if (await shouldSkip(db, { membershipId: target.membershipId, slot, now })) return 'skipped';
  if (!(await claimReminder(db, { membershipId: target.membershipId, slot, now }))) return 'skipped';
  await notifyDevices(db, { push: input.push, tokens: target.tokens, message: shiftReminderMessage(slot, target.storeName), logTag: LOG_TAG });
  return 'sent';
}

/** 출근 알림: 이미 근무 중이거나 소정 출근 2시간 전부터 찍은 출근이 있으면. 퇴근 알림: 근무 중이 아니면 (§6) */
async function shouldSkip(db: PrismaClient, input: { membershipId: string; slot: ShiftReminderSlot; now: Date }): Promise<boolean> {
  const open = await db.attendance.findFirst({ where: { membershipId: input.membershipId, status: 'OPEN' }, select: { id: true } });
  if (input.slot.kind === 'END_SOON' || input.slot.kind === 'END_NOW') return open === null;
  if (open) return true;
  const earliest = new Date(input.slot.shift.startAt.getTime() - EARLY_CLOCK_IN_MS);
  const clockedIn = await db.attendance.findFirst({
    where: { membershipId: input.membershipId, status: { not: 'VOID' }, clockInAt: { gte: earliest, lte: input.now } },
    select: { id: true },
  });
  return clockedIn !== null;
}

/** 발송 기록을 먼저 남긴다. 유니크 충돌이면 이미 다른 실행이 보냈다 (§5) */
async function claimReminder(db: PrismaClient, input: { membershipId: string; slot: ShiftReminderSlot; now: Date }): Promise<boolean> {
  try {
    await db.shiftReminder.create({
      data: { membershipId: input.membershipId, kind: input.slot.kind, scheduledAt: input.slot.at, sentAt: input.now },
    });
    return true;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return false;
    throw error;
  }
}
