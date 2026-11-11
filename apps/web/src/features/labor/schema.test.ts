import { describe, expect, it } from 'vitest';

import { CreateTermsBody, toWorkMinutes } from './schema';

const validTerms = {
  effectiveFrom: '2026-11-01',
  hourlyWage: 10320,
  schedules: [{ weekday: 1, startTime: '18:00', endTime: '23:00', breakMinutes: 30 }],
  weeklyHolidayWeekday: 0,
  contractStartDate: '2026-11-01',
  contractEndDate: null,
};

describe('toWorkMinutes', () => {
  it('자정을 넘는 근무는 익일 퇴근으로 계산한다', () => {
    expect(toWorkMinutes('18:00', '02:00')).toBe(480);
  });
});

describe('CreateTermsBody', () => {
  it('정상 입력은 통과한다', () => {
    expect(CreateTermsBody.safeParse(validTerms).success).toBe(true);
  });

  it('공제 방식은 기본 없음이고 3.3%·4대보험만 받는다', () => {
    expect(CreateTermsBody.parse(validTerms).deductionType).toBe('NONE');
    expect(CreateTermsBody.parse({ ...validTerms, deductionType: 'WITHHOLDING_3_3' }).deductionType).toBe('WITHHOLDING_3_3');
    expect(CreateTermsBody.safeParse({ ...validTerms, deductionType: 'FREELANCER' }).success).toBe(false);
  });

  it('같은 요일이 두 번 있으면 실패한다', () => {
    const schedule = validTerms.schedules[0];
    const result = CreateTermsBody.safeParse({ ...validTerms, schedules: [schedule, schedule] });
    expect(result.success).toBe(false);
  });

  it('휴게가 근무시간 이상이면 실패한다', () => {
    const result = CreateTermsBody.safeParse({
      ...validTerms,
      schedules: [{ weekday: 1, startTime: '18:00', endTime: '19:00', breakMinutes: 60 }],
    });
    expect(result.success).toBe(false);
  });

  it('주마다 다르면 주 평균 시간이 필요하다', () => {
    const result = CreateTermsBody.safeParse({ ...validTerms, scheduleVaries: true });
    expect(result.success).toBe(false);
  });

  it('적용 시작일이 계약 시작일보다 이르면 실패한다', () => {
    const result = CreateTermsBody.safeParse({ ...validTerms, effectiveFrom: '2026-10-31' });
    expect(result.success).toBe(false);
  });
});
