import { describe, expect, it } from 'vitest';

import { dueShiftReminders, formatLocalClock, scheduledShiftOn, shiftReminderSlots, type ReminderTerms } from './shift-reminders';

const kst = (local: string) => new Date(`${local}+09:00`);

const terms = (overrides: Partial<ReminderTerms> = {}): ReminderTerms => ({
  effectiveFrom: kst('2026-10-01T00:00:00'),
  effectiveTo: null,
  scheduleVaries: false,
  contractStartDate: new Date('2026-10-01'),
  contractEndDate: null,
  // 월요일 18:00–23:00
  schedules: [{ weekday: 1, startMinute: 18 * 60, workMinutes: 300 }],
  ...overrides,
});

describe('scheduledShiftOn', () => {
  it('그 요일 소정 출근·퇴근', () => {
    expect(scheduledShiftOn([terms()], '2026-11-16')).toEqual({ startAt: kst('2026-11-16T18:00:00'), endAt: kst('2026-11-16T23:00:00') });
  });

  it('자정을 넘으면 퇴근은 다음 날', () => {
    const overnight = terms({ schedules: [{ weekday: 1, startMinute: 22 * 60, workMinutes: 360 }] });
    expect(scheduledShiftOn([overnight], '2026-11-16')?.endAt).toEqual(kst('2026-11-17T04:00:00'));
  });

  it('스케줄 없는 요일·주마다 다름·계약 밖·유효 버전 없음은 null', () => {
    expect(scheduledShiftOn([terms()], '2026-11-17')).toBeNull();
    expect(scheduledShiftOn([terms({ scheduleVaries: true })], '2026-11-16')).toBeNull();
    expect(scheduledShiftOn([terms({ contractEndDate: new Date('2026-11-15') })], '2026-11-16')).toBeNull();
    expect(scheduledShiftOn([terms({ effectiveFrom: kst('2026-11-16T19:00:00') })], '2026-11-16')).toBeNull();
  });
});

describe('shiftReminderSlots', () => {
  it('출근·퇴근 10분 전과 정시', () => {
    const slots = shiftReminderSlots({ startAt: kst('2026-11-16T18:00:00'), endAt: kst('2026-11-16T23:00:00') });
    expect(slots.map((slot) => [slot.kind, formatLocalClock(slot.at)])).toEqual([
      ['START_SOON', '17:50'],
      ['START_NOW', '18:00'],
      ['END_SOON', '22:50'],
      ['END_NOW', '23:00'],
    ]);
  });
});

describe('dueShiftReminders', () => {
  const kindsAt = (local: string, versions = [terms()]) => dueShiftReminders(versions, kst(local)).map((slot) => slot.kind);

  it('(지금 − 5분, 지금] 에 든 알림만', () => {
    expect(kindsAt('2026-11-16T17:50:00')).toEqual(['START_SOON']);
    expect(kindsAt('2026-11-16T17:54:59')).toEqual(['START_SOON']);
    expect(kindsAt('2026-11-16T17:55:00')).toEqual([]);
    expect(kindsAt('2026-11-16T17:49:59')).toEqual([]);
  });

  it('어제 시작한 근무의 퇴근 알림', () => {
    const overnight = terms({ schedules: [{ weekday: 1, startMinute: 22 * 60, workMinutes: 360 }] });
    expect(kindsAt('2026-11-17T04:00:00', [overnight])).toEqual(['END_NOW']);
  });

  it('내일 00:05 출근의 10분 전 알림은 오늘 23:55', () => {
    const early = terms({ schedules: [{ weekday: 2, startMinute: 5, workMinutes: 240 }] });
    expect(kindsAt('2026-11-16T23:56:00', [early])).toEqual(['START_SOON']);
  });
});
