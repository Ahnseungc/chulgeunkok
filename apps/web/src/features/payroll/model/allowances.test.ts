import { describe, expect, it } from 'vitest';

import { closedWeekStarts, estimateAllowances, type AllowanceTerms, type AllowanceWork } from './allowances';
import { toLocalDate, toSegments } from './work-time';

const kst = (local: string) => new Date(`${local}+09:00`);
const PERIOD = { start: '2026-11-01', end: '2026-12-01' };
const WEEKDAYS = [1, 2, 3, 4, 5];

/** 월~금 09:00–18:00 휴게 60분 (주 40시간), 주휴일 일요일, 시급 10,000 */
const fullTime: AllowanceTerms = {
  effectiveFrom: kst('2026-10-01T00:00:00'),
  effectiveTo: null,
  hourlyWage: 10000,
  schedules: WEEKDAYS.map((weekday) => ({ weekday, workMinutes: 9 * 60, breakMinutes: 60 })),
  scheduleVaries: false,
  averageWeeklyMinutesOverride: null,
  weeklyHolidayWeekday: 0,
};

/** 월·수·금 5시간 휴게 없음 (주 15시간) */
const partTime: AllowanceTerms = {
  ...fullTime,
  schedules: [1, 3, 5].map((weekday) => ({ weekday, workMinutes: 5 * 60, breakMinutes: 0 })),
};

const work = (clockIn: string, clockOut: string, terms = fullTime): AllowanceWork => {
  const clockInAt = kst(clockIn);
  const clockOutAt = kst(clockOut);
  const { segments } = toSegments({ attendance: { id: clockIn, clockInAt, clockOutAt, breakWaived: false }, terms });
  return { clockInAt, clockOutAt, terms, segments };
};

/** 11/2(월)~11/6(금) 소정대로 근무 */
const fullWeek = ['02', '03', '04', '05', '06'].map((day) => work(`2026-11-${day}T09:00:00`, `2026-11-${day}T18:00:00`));

const estimate = (works: AllowanceWork[], options: { fiveOrMore?: boolean; today?: string; terms?: AllowanceTerms } = {}) =>
  estimateAllowances({
    period: PERIOD,
    today: options.today ?? '2026-11-20',
    terms: [options.terms ?? fullTime],
    attendedDates: new Set(works.map((item) => toLocalDate(item.clockInAt))),
    works,
    isFiveOrMore: () => options.fiveOrMore ?? false,
  });

describe('closedWeekStarts', () => {
  it('일요일이 기간 안이고 이미 지난 주만', () => {
    // 11/1(일)은 10/26 주의 끝. 11/22(일)은 아직 안 끝났다
    expect(closedWeekStarts(PERIOD, '2026-11-20')).toEqual(['2026-10-26', '2026-11-02', '2026-11-09']);
  });
});

describe('주휴수당 (payroll §3.6)', () => {
  it('주 40시간 개근이면 8시간분', () => {
    expect([estimate(fullWeek).weeklyHolidayPay, estimate(fullWeek).weeklyHolidayWeeks]).toEqual([80000, 1]);
  });

  it('소정 근무일에 하루라도 빠지면 0', () => {
    expect(estimate(fullWeek.slice(1)).weeklyHolidayPay).toBe(0);
  });

  it('주 15시간이면 15/40 × 8시간분', () => {
    const works = ['02', '04', '06'].map((day) => work(`2026-11-${day}T09:00:00`, `2026-11-${day}T14:00:00`, partTime));
    expect(estimate(works, { terms: partTime }).weeklyHolidayPay).toBe(30000);
  });

  it('아직 끝나지 않은 주는 세지 않는다', () => {
    expect(estimate(fullWeek, { today: '2026-11-08' }).weeklyHolidayPay).toBe(0);
  });

  it('5인 미만 신고여도 계산한다', () => {
    expect(estimate(fullWeek, { fiveOrMore: false }).total).toBe(80000);
  });
});

describe('가산수당 (5인 이상)', () => {
  it('하루 8시간 넘은 시간에 50%', () => {
    // 11h − 휴게 1h = 10h → 연장 2h
    const result = estimate([work('2026-11-02T09:00:00', '2026-11-02T20:00:00')], { fiveOrMore: true });
    expect([result.overtimeSeconds, result.overtimePremium]).toEqual([2 * 3600, 10000]);
  });

  it('5인 미만 신고 날짜는 가산하지 않는다', () => {
    const result = estimate([work('2026-11-02T09:00:00', '2026-11-02T20:00:00')], { fiveOrMore: false });
    expect([result.overtimePremium, result.nightPremium, result.holidayPremium]).toEqual([0, 0, 0]);
  });

  it('22:00–06:00 근무에 50%. 자정을 넘겨도 날짜마다 센다', () => {
    // 금 18:00–토 02:00: 금 22–24 2h + 토 0–2 2h
    const result = estimate([work('2026-11-06T18:00:00', '2026-11-07T02:00:00')], { fiveOrMore: true });
    expect([result.nightSeconds, result.nightPremium, result.overtimeSeconds]).toEqual([4 * 3600, 20000, 0]);
  });

  it('주휴일 근무는 8시간까지 50%, 넘으면 100%이고 연장으로 겹쳐 세지 않는다', () => {
    // 일 09:00–20:00, 소정 없는 날이라 휴게 차감 없음 → 11h
    const result = estimate([work('2026-11-08T09:00:00', '2026-11-08T20:00:00')], { fiveOrMore: true });
    expect([result.holidaySeconds, result.holidayPremium, result.overtimeSeconds]).toEqual([11 * 3600, 70000, 0]);
  });

  it('주 40시간 넘은 시간에 50% (일 8시간 초과로 센 시간은 빼고)', () => {
    // 월~금 8h + 토 09:00–17:00 8h = 48h
    const result = estimate([...fullWeek, work('2026-11-07T09:00:00', '2026-11-07T17:00:00')], { fiveOrMore: true });
    expect([result.overtimeSeconds, result.overtimePremium, result.total]).toEqual([8 * 3600, 40000, 120000]);
  });

  it('단시간근로자는 그날 소정근로를 넘은 시간부터', () => {
    // 월 소정 5h, 7h 근무 → 연장 2h. 소정 없는 화요일 3h → 전부 연장
    const works = [work('2026-11-02T09:00:00', '2026-11-02T16:00:00', partTime), work('2026-11-03T09:00:00', '2026-11-03T12:00:00', partTime)];
    expect(estimate(works, { fiveOrMore: true, terms: partTime }).overtimeSeconds).toBe(5 * 3600);
  });
});
