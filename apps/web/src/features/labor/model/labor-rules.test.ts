import { describe, expect, it } from 'vitest';

import {
  evaluateTermsReviews,
  requiredBreakMinutes,
  weeklyContractMinutes,
  type TermsRuleInput,
} from './labor-rules';

const MINIMUM_WAGE_2026 = { minimumHourlyWage: 10320 };

/** 월·수·금 18:00–23:00 (300분), 휴게 0분 */
const partTimer = (overrides: Partial<TermsRuleInput> = {}): TermsRuleInput => ({
  hourlyWage: 10320,
  schedules: [1, 3, 5].map((weekday) => ({ weekday, workMinutes: 300, breakMinutes: 0 })),
  scheduleVaries: false,
  averageWeeklyMinutesOverride: null,
  weeklyHolidayWeekday: 0,
  ...overrides,
});

const typesOf = (terms: TermsRuleInput) =>
  evaluateTermsReviews(terms, MINIMUM_WAGE_2026).map((finding) => finding.type);

describe('requiredBreakMinutes', () => {
  it.each([
    [239, 0],
    [240, 30],
    [479, 30],
    [480, 60],
  ])('근로 %i분 → 휴게 %i분', (laborMinutes, breakMinutes) => {
    expect(requiredBreakMinutes(laborMinutes)).toBe(breakMinutes);
  });
});

describe('weeklyContractMinutes', () => {
  it('요일별 근로시간(휴게 제외)을 더한다', () => {
    expect(weeklyContractMinutes(partTimer({ schedules: [{ weekday: 1, workMinutes: 300, breakMinutes: 30 }] }))).toBe(270);
  });

  it('주마다 다르면 입력한 주 평균을 쓴다', () => {
    expect(weeklyContractMinutes(partTimer({ scheduleVaries: true, averageWeeklyMinutesOverride: 1200 }))).toBe(1200);
  });
});

describe('evaluateTermsReviews', () => {
  it('스펙 예시: 월·수·금 5시간 휴게 없음 → 휴게 부족·주휴·단시간', () => {
    expect(typesOf(partTimer())).toEqual(['BREAK_SHORTAGE', 'WEEKLY_HOLIDAY', 'SHORT_TIME_OVERTIME']);
  });

  it('최저임금 미달이면 가장 먼저 안내한다', () => {
    expect(typesOf(partTimer({ hourlyWage: 10000 }))[0]).toBe('MINIMUM_WAGE');
  });

  it('휴게가 부족한 첫 요일을 사유로 남긴다', () => {
    const [finding] = evaluateTermsReviews(
      partTimer({ schedules: [{ weekday: 5, workMinutes: 300, breakMinutes: 0 }, { weekday: 2, workMinutes: 300, breakMinutes: 0 }] }),
      MINIMUM_WAGE_2026,
    );
    expect(finding?.reasonCode).toBe('DAY_2');
  });

  it('주 15시간 이상인데 주휴일이 없으면 정보 필요', () => {
    const findings = evaluateTermsReviews(partTimer({ weeklyHolidayWeekday: null }), MINIMUM_WAGE_2026);
    expect(findings.find((finding) => finding.type === 'WEEKLY_HOLIDAY')?.status).toBe('NEEDS_INFORMATION');
  });

  it('주 15시간 미만이면 주휴 안내가 없다', () => {
    expect(typesOf(partTimer({ schedules: [{ weekday: 6, workMinutes: 300, breakMinutes: 30 }] }))).not.toContain('WEEKLY_HOLIDAY');
  });

  it('주 40시간 통상근로자는 단시간 안내가 없다', () => {
    const fullTime = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, workMinutes: 540, breakMinutes: 60 }));
    expect(typesOf(partTimer({ schedules: fullTime }))).toEqual(['WEEKLY_HOLIDAY']);
  });
});
