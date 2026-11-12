import { describe, expect, it } from 'vitest';

import { getPayPeriod, getStorePayPeriod, summarizePeriod, toSegments, type SegmentInput } from './work-time';

const HOUR = 3600;
const MINUTE = 60;

/** 서울 시각 문자열 → Date */
const kst = (local: string) => new Date(`${local}+09:00`);

/** 2026-11-02(월)~ 근무. 기본 소정 휴게는 월·금·토 요일별로 지정 */
const attendanceOf = (
  clockIn: string,
  clockOut: string,
  options: {
    breakMinutes?: number;
    weekday?: number;
    breakWaived?: boolean;
    hourlyWage?: number;
    /** 직원이 남긴 휴게 [시작, 끝] (서울 시각) */
    breaks?: [string, string][];
  } = {},
): SegmentInput => {
  const clockInAt = kst(clockIn);
  const weekday = options.weekday ?? new Date(clockInAt.getTime() + 9 * HOUR * 1000).getUTCDay();
  return {
    attendance: {
      id: 'a',
      clockInAt,
      clockOutAt: kst(clockOut),
      breakWaived: options.breakWaived ?? false,
      breaks: (options.breaks ?? []).map(([start, end]) => ({ startAt: kst(start), endAt: kst(end) })),
    },
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

describe('toSegments — 기록한 휴게 (payroll §3.2, §3.5 #9–#13)', () => {
  it('#9 18:00–23:00에 20:00–20:20 휴게를 남기면 소정 30분 대신 20분을 빼 4시간 40분', () => {
    expect(
      recognized(
        attendanceOf('2026-11-02T18:00:00', '2026-11-02T23:00:00', {
          breakMinutes: 30,
          breaks: [['2026-11-02T20:00:00', '2026-11-02T20:20:00']],
        }),
      ),
    ).toEqual([4 * HOUR + 40 * MINUTE]);
  });

  it('#10 자정을 넘는 휴게는 걸친 만큼 각 날짜 구간에서 뺀다', () => {
    // 월 20:00–화 04:00, 휴게 23:40–00:30 → 월 4h−20m, 화 4h−30m
    expect(
      recognized(
        attendanceOf('2026-11-02T20:00:00', '2026-11-03T04:00:00', {
          breakMinutes: 60,
          breaks: [['2026-11-02T23:40:00', '2026-11-03T00:30:00']],
        }),
      ),
    ).toEqual([3 * HOUR + 40 * MINUTE, 3 * HOUR + 30 * MINUTE]);
  });

  it('#11 여러 번 남긴 휴게를 합해서 뺀다', () => {
    const { segments } = toSegments(
      attendanceOf('2026-11-02T18:00:00', '2026-11-02T23:00:00', {
        breaks: [
          ['2026-11-02T19:00:00', '2026-11-02T19:10:00'],
          ['2026-11-02T21:00:00', '2026-11-02T21:15:00'],
        ],
      }),
    );
    expect(segments.map((segment) => [segment.breakSeconds, segment.recognizedSeconds])).toEqual([
      [25 * MINUTE, 4 * HOUR + 35 * MINUTE],
    ]);
  });

  it('#12 기록이 있으면 휴게 못 함·4시간 미만·소정 없음과 상관없이 기록만 뺀다', () => {
    const waived = attendanceOf('2026-11-02T18:00:00', '2026-11-02T23:00:00', {
      breakMinutes: 30,
      breakWaived: true,
      breaks: [['2026-11-02T20:00:00', '2026-11-02T20:20:00']],
    });
    const short = attendanceOf('2026-11-02T18:00:00', '2026-11-02T21:00:00', {
      breakMinutes: 30,
      breaks: [['2026-11-02T19:00:00', '2026-11-02T19:10:00']],
    });
    const unscheduled = toSegments(
      attendanceOf('2026-11-07T10:00:00', '2026-11-07T16:00:00', { breaks: [['2026-11-07T12:00:00', '2026-11-07T12:30:00']] }),
    );
    expect([recognized(waived), recognized(short)]).toEqual([[4 * HOUR + 40 * MINUTE], [2 * HOUR + 50 * MINUTE]]);
    expect([unscheduled.segments[0]?.recognizedSeconds, unscheduled.breakNotScheduled]).toEqual([5.5 * HOUR, false]);
  });

  it('#13 근무 밖으로 나간 휴게는 근무 안 부분만 뺀다 (관리자가 퇴근을 당긴 경우)', () => {
    expect(
      recognized(
        attendanceOf('2026-11-02T18:00:00', '2026-11-02T22:00:00', {
          breakMinutes: 30,
          breaks: [['2026-11-02T21:50:00', '2026-11-02T22:30:00']],
        }),
      ),
    ).toEqual([3 * HOUR + 50 * MINUTE]);
  });

  it('#14 9–18에 30초 휴게만 남기면 기록으로 치지 않고 소정 60분을 뺀다 (1분 미만)', () => {
    expect(
      recognized(
        attendanceOf('2026-11-02T09:00:00', '2026-11-02T18:00:00', {
          breakMinutes: 60,
          breaks: [['2026-11-02T12:00:00', '2026-11-02T12:00:30']],
        }),
      ),
    ).toEqual([8 * HOUR]);
  });

  it('#15 길이 0으로 접힌 휴게만 있으면 소정 휴게를 뺀다', () => {
    expect(
      recognized(
        attendanceOf('2026-11-02T09:00:00', '2026-11-02T18:00:00', {
          breakMinutes: 60,
          breaks: [['2026-11-02T18:00:00', '2026-11-02T18:00:00']],
        }),
      ),
    ).toEqual([8 * HOUR]);
  });

  it('#16 1분 이상 휴게와 짧은 휴게가 섞이면 1분 이상만 뺀다', () => {
    expect(
      recognized(
        attendanceOf('2026-11-02T09:00:00', '2026-11-02T18:00:00', {
          breakMinutes: 60,
          breaks: [
            ['2026-11-02T12:00:00', '2026-11-02T12:00:30'],
            ['2026-11-02T13:00:00', '2026-11-02T13:01:00'],
          ],
        }),
      ),
    ).toEqual([9 * HOUR - MINUTE]);
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

describe('getStorePayPeriod — 정산 시작일 변경 (store §4)', () => {
  // 1일 → 21일, 12/1부터 적용
  const changed = { startDay: 21, previousStartDay: 1, changeEffectiveFrom: '2026-12-01' };

  it('바뀌기 전 기간은 이전 시작일로 계산한다', () => {
    expect(getStorePayPeriod('2026-11-15', changed)).toEqual({ start: '2026-11-01', end: '2026-12-01' });
  });

  it('바뀌는 날부터 새 시작일까지 짧은 전환 기간이 생긴다', () => {
    expect(getStorePayPeriod('2026-12-10', changed)).toEqual({ start: '2026-12-01', end: '2026-12-21' });
  });

  it('그 뒤로는 새 시작일 기간이다', () => {
    expect(getStorePayPeriod('2026-12-25', changed)).toEqual({ start: '2026-12-21', end: '2027-01-21' });
  });

  it('21일 → 1일로 바꿔도 이전 기간이 바뀌는 날에서 끝난다', () => {
    const back = { startDay: 1, previousStartDay: 21, changeEffectiveFrom: '2026-11-21' };
    expect([getStorePayPeriod('2026-11-10', back), getStorePayPeriod('2026-11-25', back)]).toEqual([
      { start: '2026-10-21', end: '2026-11-21' },
      { start: '2026-11-21', end: '2026-12-01' },
    ]);
  });

  it('변경이 없으면 그대로', () => {
    expect(getStorePayPeriod('2026-11-15', { startDay: 1, previousStartDay: null, changeEffectiveFrom: null })).toEqual({
      start: '2026-11-01',
      end: '2026-12-01',
    });
  });
});
