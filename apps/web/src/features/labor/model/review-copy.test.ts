import { describe, expect, it } from 'vitest';

import { reviewCopy } from './review-copy';

const CONTEXT = { minimumHourlyWage: 10320, ruleYear: '2026' };

describe('reviewCopy BREAK_SHORTAGE (labor §6.3)', () => {
  it('근로조건 검토는 요일로 안내한다', () => {
    expect(reviewCopy({ type: 'BREAK_SHORTAGE', reasonCode: 'DAY_1' }, CONTEXT).body).toBe(
      '월요일 근무에 법정 휴게시간이 부족해요. 4시간마다 30분 이상 쉬어야 해요.',
    );
  });

  it('기록한 휴게 검토는 날짜로 안내한다', () => {
    expect(reviewCopy({ type: 'BREAK_SHORTAGE', reasonCode: 'RECORDED:2026-11-09' }, CONTEXT).body).toBe(
      '11월 9일 근무에 남긴 휴게가 법정 휴게시간보다 짧아요. 4시간마다 30분 이상 쉬어야 해요.',
    );
  });
});
