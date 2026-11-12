import { describe, expect, it } from 'vitest';

import { estimateHeadcount, headcountMismatch } from './headcount-estimate';

const row = (localDate: string, membershipId: string) => ({ localDate, membershipId });

describe('estimateHeadcount (docs/specs/store §6.4)', () => {
  it('날짜별 서로 다른 근무자 수의 합을 가동일수로 나눈다', () => {
    const result = estimateHeadcount([row('2026-10-01', 'a'), row('2026-10-01', 'b'), row('2026-10-02', 'a')]);
    expect(result).toEqual({ average: 1.5, workerDays: 3, operatingDays: 2 });
  });

  it('같은 사람이 같은 날 여러 번 일해도 1로 센다', () => {
    const result = estimateHeadcount([row('2026-10-01', 'a'), row('2026-10-01', 'a')]);
    expect(result).toEqual({ average: 1, workerDays: 1, operatingDays: 1 });
  });

  it('기록이 없으면 평균은 null', () => {
    expect(estimateHeadcount([])).toEqual({ average: null, workerDays: 0, operatingDays: 0 });
  });

  it('소수 첫째 자리에서 반올림한다 (half up)', () => {
    // 1명, 1명, 2명 -> 4/3 = 1.33
    expect(estimateHeadcount([row('d1', 'a'), row('d2', 'a'), row('d3', 'a'), row('d3', 'b')]).average).toBe(1.3);
    // 2명 하루, 1명 하루 -> 1.5, 3명 하루 + 2명 하루 +... 아래는 정확히 x.x5 경계: 41/20 = 2.05 -> 2.1
    const rows = Array.from({ length: 20 }, (_, day) => `d${day}`).flatMap((date, day) =>
      Array.from({ length: day === 0 ? 3 : 2 }, (_, index) => row(date, `m${index}`)),
    );
    expect(estimateHeadcount(rows)).toMatchObject({ workerDays: 41, operatingDays: 20, average: 2.1 });
  });
});

describe('headcountMismatch', () => {
  it('5인 미만 신고인데 평균이 5 이상이면 5인 이상일 수 있다', () => {
    expect(headcountMismatch(5, 'UNDER_5')).toBe('MAYBE_FIVE_OR_MORE');
  });
  it('5인 이상 신고인데 평균이 5 미만이면 5인 미만일 수 있다', () => {
    expect(headcountMismatch(4.96, 'FIVE_OR_MORE')).toBe('MAYBE_UNDER_5');
  });
  it('반올림 전 값으로 비교한다 (4.96은 5.0으로 보여도 5 미만)', () => {
    expect(headcountMismatch(4.96, 'UNDER_5')).toBeNull();
  });
  it('맞으면 null, 미신고·평균 없음도 null', () => {
    expect(headcountMismatch(6, 'FIVE_OR_MORE')).toBeNull();
    expect(headcountMismatch(3, 'UNDER_5')).toBeNull();
    expect(headcountMismatch(8, 'UNKNOWN')).toBeNull();
    expect(headcountMismatch(null, 'UNDER_5')).toBeNull();
  });
});
