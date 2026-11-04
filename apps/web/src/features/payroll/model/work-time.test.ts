import { describe, expect, it } from 'vitest';

import { getPayPeriod, summarizePeriod, toSegments, type SegmentInput } from './work-time';

const HOUR = 3600;
const MINUTE = 60;

/** 서울 시각 문자열 → Date */
const kst = (local: string) => new Date(`${local}+09:00`);

/** 2026-11-02(월)~ 근무. 기본 소정 휴게는 월·금·토 요일별로 지정 */
const attendanceOf = (
  clockIn: string,
  clockOut: string,
  options: { breakMinutes?: number; weekday?: number; breakWaived?: boolean; hourlyWage?: number } = {},
): SegmentInput => {
  const clockInAt = kst(clockIn);
  const weekday = options.weekday ?? new Date(clockInAt.getTime() + 9 * HOUR * 1000).getUTCDay();
  return {
    attendance: { id: 'a', clockInAt, clockOutAt: kst(clockOut), breakWaived: options.breakWaived ?? false },
    terms: {
      hourlyWage: options.hourlyWage ?? 10320,
      schedules: options.breakMinutes === undefined ? [] : [{ weekday, breakMinutes: options.breakMinutes }],
    },
  };
};

const recognized = (input: SegmentInput) => toSegments(input).segments.map((segment) => segment.recognizedSeconds);

describe('getPayPeriod (payroll §3.1)', () => {
  it('시작일 1이면 그 달 1일 ~ 다음 달 1일', () => {
    expect(getPayPeriod('2026-11-15', 1)).toEqual({ start: '2026-11-01', end: '2026-12-01' });
  });

  it('시작일 21이면 10/21 ~ 11/21', () => {
    expect(getPayPeriod('2026-11-04', 21)).toEqual({ start: '2026-10-21', end: '2026-11-21' });
  });

  it('연말을 넘긴다', () => {
    expect(getPayPeriod('2027-01-05', 21)).toEqual({ start: '2026-12-21', end: '2027-01-21' });
  });
});

describe('toSegments · summarizePeriod — 스펙 예시 (payroll §3.5)', () => {
  it('#1 월 18:00–23:00, 휴게 30분, 시급 10,320 → 4시간 30분, 46,440원', () => {
    const { segments } = toSegments(attendanceOf('2026-11-02T18:00:00', '2026-11-02T23:00:00', { breakMinutes: 30 }));
    const summary = summarizePeriod(segments, getPayPeriod('2026-11-02', 1));
    expect([summary.recognizedSeconds, summary.basePayEstimate]).toEqual([4.5 * HOUR, 46440]);
  });

  it('#2 월 18:00–화 02:00, 휴게 60분 → 월 5시간, 화 2시간', () => {
    expect(recognized(attendanceOf('2026-11-02T18:00:00', '2026-11-03T02:00:00', { breakMinutes: 60 }))).toEqual([
      5 * HOUR,
      2 * HOUR,
    ]);
  });

  it('#3 10/31 20:00–11/1 02:00 → 10월 기간 3시간 30분, 11월 기간 2시간', () => {
    const { segments } = toSegments(attendanceOf('2026-10-31T20:00:00', '2026-11-01T02:00:00', { breakMinutes: 30 }));
    const october = summarizePeriod(segments, getPayPeriod('2026-10-31', 1));
    const november = summarizePeriod(segments, getPayPeriod('2026-11-01', 1));
    expect([october.recognizedSeconds, november.recognizedSeconds]).toEqual([3.5 * HOUR, 2 * HOUR]);
  });

  it('#4 3시간 59분 근무는 휴게를 빼지 않는다', () => {
    expect(recognized(attendanceOf('2026-11-02T18:00:00', '2026-11-02T21:59:00', { breakMinutes: 30 }))).toEqual([
      3 * HOUR + 59 * MINUTE,
    ]);
  });

  it('#5 휴게 못 함이 승인되면 차감 0', () => {
    expect(
      recognized(attendanceOf('2026-11-02T18:00:00', '2026-11-02T23:00:00', { breakMinutes: 30, breakWaived: true })),
    ).toEqual([5 * HOUR]);
  });

  it('#6 4시간 0분 31초 → 12,631초 × 10,320 ÷ 3600 = 36,208.87 → 36,209원 (올림)', () => {
    const { segments } = toSegments(attendanceOf('2026-11-02T18:00:00', '2026-11-02T22:00:31', { breakMinutes: 30 }));
    expect(summarizePeriod(segments, getPayPeriod('2026-11-02', 1)).basePayEstimate).toBe(36209);
  });

  it('#7 23:20–04:00, 휴게 60분 → 첫 구간(40분) 0, 둘째 구간 3시간 40분', () => {
    expect(recognized(attendanceOf('2026-11-02T23:20:00', '2026-11-03T04:00:00', { breakMinutes: 60 }))).toEqual([
      0,
      3 * HOUR + 40 * MINUTE,
    ]);
  });

  it('#8 소정 스케줄 없는 토요일 6시간 → 차감 0, 플래그', () => {
    const result = toSegments(attendanceOf('2026-11-07T10:00:00', '2026-11-07T16:00:00'));
    expect([result.segments[0]?.recognizedSeconds, result.breakNotScheduled]).toEqual([6 * HOUR, true]);
  });
});

describe('summarizePeriod', () => {
  it('시급이 다른 구간을 나눠서 보여 준다', () => {
    const first = toSegments(attendanceOf('2026-11-02T18:00:00', '2026-11-02T21:00:00', { hourlyWage: 10320 })).segments;
    const second = toSegments(attendanceOf('2026-11-09T18:00:00', '2026-11-09T21:00:00', { hourlyWage: 11000 })).segments;
    expect(summarizePeriod([...first, ...second], getPayPeriod('2026-11-02', 1)).byWage).toEqual([
      { hourlyWage: 10320, recognizedSeconds: 3 * HOUR },
      { hourlyWage: 11000, recognizedSeconds: 3 * HOUR },
    ]);
  });
});
