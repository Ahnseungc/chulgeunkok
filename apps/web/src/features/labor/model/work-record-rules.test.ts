import { describe, expect, it } from 'vitest';

import {
  isRecordedBreakShort,
  missingClockOutDeadline,
  nightWorkMinutes,
  overtimeReason,
  weekStartOf,
  type OvertimeInput,
} from './work-record-rules';

const kst = (local: string) => new Date(`${local}+09:00`);
const HOUR = 3600;

describe('missingClockOutDeadline (attendance §5.1)', () => {
  it('소정 18:00–23:00 → 다음 날 03:00', () => {
    expect(missingClockOutDeadline(kst('2026-11-02T18:02:00'), { startMinute: 18 * 60, workMinutes: 300 })).toEqual(
      kst('2026-11-03T03:00:00'),
    );
  });

  it('소정이 자정을 넘으면(20:00–02:00) 02:00 + 4시간', () => {
    expect(missingClockOutDeadline(kst('2026-11-02T20:00:00'), { startMinute: 20 * 60, workMinutes: 360 })).toEqual(
      kst('2026-11-03T06:00:00'),
    );
  });

  it('소정 스케줄이 없으면 출근 + 16시간', () => {
    expect(missingClockOutDeadline(kst('2026-11-07T10:00:00'), undefined)).toEqual(kst('2026-11-08T02:00:00'));
  });

  it('소정 퇴근 뒤에 출근했으면 출근 + 16시간 (바로 누락되지 않게)', () => {
    expect(missingClockOutDeadline(kst('2026-11-02T23:30:00'), { startMinute: 18 * 60, workMinutes: 300 })).toEqual(
      kst('2026-11-03T15:30:00'),
    );
  });
});

describe('nightWorkMinutes', () => {
  it('18:00–23:00 → 60분', () => {
    expect(nightWorkMinutes(kst('2026-11-02T18:00:00'), kst('2026-11-02T23:00:00'))).toBe(60);
  });

  it('20:00–다음 날 08:00 → 8시간', () => {
    expect(nightWorkMinutes(kst('2026-11-02T20:00:00'), kst('2026-11-03T08:00:00'))).toBe(8 * 60);
  });

  it('새벽 04:00–09:00 → 120분', () => {
    expect(nightWorkMinutes(kst('2026-11-03T04:00:00'), kst('2026-11-03T09:00:00'))).toBe(120);
  });

  it('낮 근무는 0', () => {
    expect(nightWorkMinutes(kst('2026-11-02T09:00:00'), kst('2026-11-02T18:00:00'))).toBe(0);
  });
});

describe('weekStartOf', () => {
  it.each([
    ['2026-11-02', '2026-11-02'],
    ['2026-11-08', '2026-11-02'],
    ['2026-11-04', '2026-11-02'],
  ])('%s → 월요일 %s', (date, monday) => {
    expect(weekStartOf(date)).toBe(monday);
  });
});

describe('overtimeReason', () => {
  const base = (overrides: Partial<OvertimeInput>): OvertimeInput => ({
    isShortTime: false,
    dates: ['2026-11-02'],
    dayRecognizedSeconds: new Map([['2026-11-02', 8 * HOUR]]),
    weekRecognizedSeconds: 8 * HOUR,
    scheduledLaborMinutes: () => 270,
    ...overrides,
  });

  it('통상근로자 하루 8시간까지는 없음', () => {
    expect(overtimeReason(base({}))).toBeNull();
  });

  it('통상근로자 하루 8시간 초과', () => {
    expect(overtimeReason(base({ dayRecognizedSeconds: new Map([['2026-11-02', 8 * HOUR + 60]]) }))?.reasonCode).toBe('DAILY_OVER_8H');
  });

  it('통상근로자 주 40시간 초과', () => {
    expect(overtimeReason(base({ weekRecognizedSeconds: 41 * HOUR }))?.reasonCode).toBe('WEEKLY_OVER_40H');
  });

  it('단시간근로자는 그날 소정(4시간 30분)을 넘으면', () => {
    const input = base({ isShortTime: true, dayRecognizedSeconds: new Map([['2026-11-02', 5 * HOUR]]) });
    expect(overtimeReason(input)?.reasonCode).toBe('SHORT_TIME_DAILY');
  });

  it('단시간근로자가 소정 없는 날 일하면 바로 대상', () => {
    const input = base({ isShortTime: true, scheduledLaborMinutes: () => 0, dayRecognizedSeconds: new Map([['2026-11-02', HOUR]]) });
    expect(overtimeReason(input)?.reasonCode).toBe('SHORT_TIME_DAILY');
  });
});

describe('isRecordedBreakShort (labor §5 BREAK_SHORTAGE)', () => {
  const MINUTE = 60;

  it('5시간 근무에 20분 쉬면 근로 4시간 40분 → 30분 필요 → 부족', () => {
    expect(isRecordedBreakShort({ workedSeconds: 5 * HOUR, breakSeconds: 20 * MINUTE })).toBe(true);
  });

  it('5시간 근무에 30분 쉬면 충분', () => {
    expect(isRecordedBreakShort({ workedSeconds: 5 * HOUR, breakSeconds: 30 * MINUTE })).toBe(false);
  });

  it('9시간 근무에 40분 쉬면 근로 8시간 20분 → 1시간 필요 → 부족', () => {
    expect(isRecordedBreakShort({ workedSeconds: 9 * HOUR, breakSeconds: 40 * MINUTE })).toBe(true);
  });

  it('4시간 20분 근무에 20분 쉬면 근로 4시간 → 30분 필요 → 부족 (경계)', () => {
    expect(isRecordedBreakShort({ workedSeconds: 4 * HOUR + 20 * MINUTE, breakSeconds: 20 * MINUTE })).toBe(true);
  });

  it('근로가 4시간 미만이면 휴게 의무가 없다', () => {
    expect(isRecordedBreakShort({ workedSeconds: 4 * HOUR, breakSeconds: 10 * MINUTE })).toBe(false);
  });
});
