/**
 * 출퇴근 알림 시각 계산 (순수 함수). 정본: docs/specs/notifications §3~§5
 */

import { addDays, localMidnight, localWeekday, toLocalDate } from '@/features/payroll/model/work-time';

const MINUTE_MS = 60 * 1000;
/** 10분 전 알림 (§3) */
const LEAD_MS = 10 * MINUTE_MS;
/** 배치 주기. 한 번 실행은 (지금 − 5분, 지금] 에 든 알림을 본다 (§5) */
export const REMINDER_WINDOW_MS = 5 * MINUTE_MS;
/** 어제 시작한 자정 넘는 근무 ~ 내일 이른 출근의 10분 전 알림 (§4) */
const CANDIDATE_DAY_OFFSETS = [-1, 0, 1] as const;

export type ShiftReminderKind = 'START_SOON' | 'START_NOW' | 'END_SOON' | 'END_NOW';

export interface ReminderTerms {
  effectiveFrom: Date;
  effectiveTo: Date | null;
  scheduleVaries: boolean;
  /** `@db.Date` — 매장 시간대 날짜의 UTC 자정 */
  contractStartDate: Date;
  contractEndDate: Date | null;
  schedules: readonly { weekday: number; startMinute: number; workMinutes: number }[];
}

export interface ScheduledShift {
  startAt: Date;
  endAt: Date;
}

export interface ShiftReminderSlot {
  kind: ShiftReminderKind;
  at: Date;
  shift: ScheduledShift;
}

const dateColumnOf = (date: Date) => date.toISOString().slice(0, 10);

const isEffectiveAt = (terms: ReminderTerms, at: Date) =>
  terms.effectiveFrom <= at && (terms.effectiveTo === null || at < terms.effectiveTo);

const isInContract = (terms: ReminderTerms, localDate: string) =>
  dateColumnOf(terms.contractStartDate) <= localDate &&
  (terms.contractEndDate === null || localDate <= dateColumnOf(terms.contractEndDate));

/** 그 근무일의 소정 출근·퇴근. 소정 출근 시각에 유효한 버전 기준, 주마다 다르면 모른다 (§4) */
export function scheduledShiftOn(terms: readonly ReminderTerms[], localDate: string): ScheduledShift | null {
  const dayStart = localMidnight(localDate).getTime();
  const weekday = localWeekday(localMidnight(localDate));
  for (const version of terms) {
    const schedule = version.schedules.find((candidate) => candidate.weekday === weekday);
    if (!schedule) continue;
    const startAt = new Date(dayStart + schedule.startMinute * MINUTE_MS);
    if (!isEffectiveAt(version, startAt)) continue;
    if (version.scheduleVaries || !isInContract(version, localDate)) return null;
    return { startAt, endAt: new Date(startAt.getTime() + schedule.workMinutes * MINUTE_MS) };
  }
  return null;
}

/** 한 근무의 알림 4개 (§3) */
export function shiftReminderSlots(shift: ScheduledShift): ShiftReminderSlot[] {
  const before = (at: Date) => new Date(at.getTime() - LEAD_MS);
  return [
    { kind: 'START_SOON', at: before(shift.startAt), shift },
    { kind: 'START_NOW', at: shift.startAt, shift },
    { kind: 'END_SOON', at: before(shift.endAt), shift },
    { kind: 'END_NOW', at: shift.endAt, shift },
  ];
}

export const isReminderDue = (at: Date, now: Date) => at.getTime() > now.getTime() - REMINDER_WINDOW_MS && at <= now;

/** 이번 실행에서 보낼 알림 (§4·§5) */
export function dueShiftReminders(terms: readonly ReminderTerms[], now: Date): ShiftReminderSlot[] {
  const today = toLocalDate(now);
  return CANDIDATE_DAY_OFFSETS.flatMap((offset) => {
    const shift = scheduledShiftOn(terms, addDays(today, offset));
    return shift ? shiftReminderSlots(shift).filter((slot) => isReminderDue(slot.at, now)) : [];
  });
}

/** 매장 시간대 `HH:MM` */
export function formatLocalClock(at: Date): string {
  const minutes = Math.floor((at.getTime() - localMidnight(toLocalDate(at)).getTime()) / MINUTE_MS);
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}
