import type { DeductionType } from '@chulgeunkok/db';
import { describe, expect, it } from 'vitest';

import type { AllowanceEstimate } from '@/features/payroll/model/allowances';
import type { PayrollMemberDto } from '@/features/payroll/model/payroll-types';

import {
  buildDeductionLines,
  buildEarningLines,
  calculateWithholding33,
  hasCalculatedChange,
  mergeLines,
  payDateFor,
  summaryOf,
  totalsOf,
} from './payslip-calc';
import type { LineDraft } from './payslip-types';

/** 공제 방식이 그대로인 mergeLines 입력 */
const same = (type: DeductionType) => ({ currentDeductionType: type, deductionType: type, previousSent: [] });
/** 공제 방식을 바꾸는 mergeLines 입력 */
const changed = (from: DeductionType, to: DeductionType, previousSent: LineDraft[] = []) => ({
  currentDeductionType: from,
  deductionType: to,
  previousSent,
});

const NO_ALLOWANCES: AllowanceEstimate = {
  weeklyHolidayPay: 0,
  weeklyHolidayWeeks: 0,
  overtimePremium: 0,
  overtimeSeconds: 0,
  nightPremium: 0,
  nightSeconds: 0,
  holidayPremium: 0,
  holidaySeconds: 0,
  paidHolidayPay: 0,
  paidHolidayDays: 0,
  total: 0,
};

const member = (overrides: Partial<PayrollMemberDto> = {}): PayrollMemberDto => ({
  memberId: 'm1',
  name: '김알바',
  status: 'ACTIVE',
  recognizedSeconds: 0,
  basePayEstimate: 0,
  byWage: [],
  allowances: NO_ALLOWANCES,
  attendanceCount: 0,
  workDays: 0,
  flags: { openCount: 0, missingClockOutCount: 0, pendingCorrectionCount: 0, breakNotScheduledCount: 0, openLaborReviewCount: 0 },
  ...overrides,
});

const line = (overrides: Partial<LineDraft>): LineDraft => ({
  kind: 'EARNING',
  code: 'BASE_PAY',
  label: '기본급',
  basis: '',
  calculatedAmount: 0,
  amount: 0,
  adjustReason: null,
  sortOrder: 0,
  ...overrides,
});

describe('calculateWithholding33', () => {
  it('3.3%는 10원 미만 절사', () => {
    expect(calculateWithholding33(1_234_567)).toEqual({ incomeTax: 37_030, localIncomeTax: 3_700 });
  });
});

describe('payDateFor', () => {
  it('지급일은 기간 끝 이후 처음 오는 payDay', () => {
    expect(payDateFor('2026-11-01', 10)).toBe('2026-11-10');
    expect(payDateFor('2026-11-21', 10)).toBe('2026-12-10');
    expect(payDateFor('2026-02-01', 31)).toBe('2026-02-28');
    expect(payDateFor('2026-11-01', null)).toBeNull();
  });

  it('연말을 넘기면 다음 해 1월', () => {
    expect(payDateFor('2026-12-21', 10)).toBe('2027-01-10');
  });

  it('다음 달에 없는 날이면 말일', () => {
    expect(payDateFor('2026-01-21', 31)).toBe('2026-01-31');
    expect(payDateFor('2026-01-31', 30)).toBe('2026-02-28');
  });
});

describe('buildEarningLines', () => {
  it('0원 항목은 만들지 않고 기본급 basis를 만든다', () => {
    const lines = buildEarningLines(
      member({ basePayEstimate: 469_560, byWage: [{ hourlyWage: 10_320, recognizedSeconds: 45.5 * 3600 }] }),
    );
    expect(lines.map((l) => l.code)).toEqual(['BASE_PAY']);
    expect(lines[0]).toMatchObject({ basis: '45시간 30분 × 10,320원', calculatedAmount: 469_560, amount: 469_560 });
  });

  it('시급이 두 개면 basis가 두 줄', () => {
    const lines = buildEarningLines(
      member({
        basePayEstimate: 300_000,
        byWage: [
          { hourlyWage: 10_000, recognizedSeconds: 20 * 3600 },
          { hourlyWage: 10_320, recognizedSeconds: 10 * 3600 },
        ],
      }),
    );
    expect(lines[0]?.basis.split('\n')).toEqual(['20시간 × 10,000원', '10시간 × 10,320원']);
    expect(lines[0]?.amount).toBe(300_000);
  });

  it('분이 0이 아닐 때만 분을 붙이고 시간이 0이면 분만 쓴다', () => {
    const lines = buildEarningLines(
      member({ basePayEstimate: 1, byWage: [{ hourlyWage: 10_320, recognizedSeconds: 30 * 60 }] }),
    );
    expect(lines[0]?.basis).toBe('30분 × 10,320원');
  });

  it('수당 줄은 EARNING_CODES 순서와 sortOrder로 나온다', () => {
    const lines = buildEarningLines(
      member({
        basePayEstimate: 100_000,
        byWage: [{ hourlyWage: 10_000, recognizedSeconds: 10 * 3600 }],
        allowances: {
          ...NO_ALLOWANCES,
          weeklyHolidayPay: 40_000,
          weeklyHolidayWeeks: 4,
          overtimePremium: 15_000,
          overtimeSeconds: 3 * 3600,
          paidHolidayPay: 20_000,
          paidHolidayDays: 2,
        },
      }),
    );
    expect(lines.map((l) => [l.code, l.basis, l.sortOrder])).toEqual([
      ['BASE_PAY', '10시간 × 10,000원', 0],
      ['WEEKLY_HOLIDAY_PAY', '4주', 1],
      ['OVERTIME_PREMIUM', '3시간 × 0.5', 2],
      ['PAID_HOLIDAY_PAY', '2일', 5],
    ]);
  });
});

describe('buildDeductionLines', () => {
  it('NONE은 줄이 없다', () => {
    expect(buildDeductionLines({ type: 'NONE', grossPay: 500_000, previousSent: [] })).toEqual([]);
  });

  it('3.3%는 소득세·지방소득세 두 줄', () => {
    const lines = buildDeductionLines({ type: 'WITHHOLDING_3_3', grossPay: 500_000, previousSent: [] });
    expect(lines.map((l) => [l.code, l.amount, l.calculatedAmount])).toEqual([
      ['INCOME_TAX', 15_000, 15_000],
      ['LOCAL_INCOME_TAX', 1_500, 1_500],
    ]);
  });

  it('4대보험은 직전 보낸 금액으로 채운다', () => {
    const previousSent = [line({ kind: 'DEDUCTION', code: 'NATIONAL_PENSION', amount: 40_000, calculatedAmount: null })];
    const lines = buildDeductionLines({ type: 'SOCIAL_INSURANCE', grossPay: 500_000, previousSent });
    expect(lines).toHaveLength(6);
    expect(lines.find((l) => l.code === 'NATIONAL_PENSION')).toMatchObject({ amount: 40_000, calculatedAmount: null });
    expect(lines.find((l) => l.code === 'HEALTH_INSURANCE')).toMatchObject({ amount: 0, calculatedAmount: null });
  });

  it('직전 보낸 명세서가 없으면 0원', () => {
    const lines = buildDeductionLines({ type: 'SOCIAL_INSURANCE', grossPay: 500_000, previousSent: [] });
    expect(lines.every((l) => l.amount === 0)).toBe(true);
    expect(lines.map((l) => l.sortOrder)).toEqual([0, 1, 2, 3, 4, 5]);
  });
});

describe('mergeLines', () => {
  it('조정한 줄은 금액을 유지하고 계산값만 바꾼다', () => {
    const current = [line({ calculatedAmount: 400_000, amount: 500_000, adjustReason: '식대 포함' })];
    const fresh = [line({ calculatedAmount: 469_560, amount: 469_560 })];
    const [merged] = mergeLines({ current, fresh, ...same('NONE') });
    expect(merged).toMatchObject({ amount: 500_000, calculatedAmount: 469_560, adjustReason: '식대 포함' });
  });

  it('조정 안 한 줄은 amount도 따라간다', () => {
    const current = [line({ calculatedAmount: 400_000, amount: 400_000 })];
    const fresh = [line({ calculatedAmount: 469_560, amount: 469_560 })];
    const [merged] = mergeLines({ current, fresh, ...same('NONE') });
    expect(merged).toMatchObject({ amount: 469_560, calculatedAmount: 469_560 });
  });

  it('사라진 계산 줄은 0원으로 남는다', () => {
    const current = [line({ code: 'NIGHT_PREMIUM', label: '야간근로 가산', calculatedAmount: 5_000, amount: 5_000 })];
    const [merged] = mergeLines({ current, fresh: [], ...same('NONE') });
    expect(merged).toMatchObject({ code: 'NIGHT_PREMIUM', calculatedAmount: 0, amount: 0 });
  });

  it('사라졌어도 조정한 줄은 금액을 유지한다', () => {
    const current = [line({ code: 'NIGHT_PREMIUM', calculatedAmount: 5_000, amount: 7_000, adjustReason: '합의' })];
    const [merged] = mergeLines({ current, fresh: [], ...same('NONE') });
    expect(merged).toMatchObject({ calculatedAmount: 0, amount: 7_000 });
  });

  it('새로 생긴 계산 줄을 추가하고 순서를 맞춘다', () => {
    const current = [line({ code: 'CUSTOM', label: '식대', calculatedAmount: null, amount: 100_000, sortOrder: 1 }), line({ calculatedAmount: 1, amount: 1 })];
    const fresh = [
      line({ calculatedAmount: 1, amount: 1 }),
      line({ code: 'WEEKLY_HOLIDAY_PAY', calculatedAmount: 9_000, amount: 9_000 }),
    ];
    const merged = mergeLines({ current, fresh, ...same('NONE') });
    expect(merged.map((l) => [l.code, l.sortOrder])).toEqual([
      ['BASE_PAY', 0],
      ['WEEKLY_HOLIDAY_PAY', 1],
      ['CUSTOM', 2],
    ]);
  });

  it('CUSTOM 줄은 그대로 둔다', () => {
    const custom = line({ code: 'CUSTOM', label: '식대', calculatedAmount: null, amount: 100_000 });
    const merged = mergeLines({ current: [custom], fresh: [], ...same('NONE') });
    expect(merged[0]).toMatchObject({ code: 'CUSTOM', amount: 100_000, calculatedAmount: null });
  });

  it('deductionType을 바꾸면 공제 줄 묶음을 갈아 끼운다', () => {
    const current = [
      line({ calculatedAmount: 500_000, amount: 500_000 }),
      ...buildDeductionLines({ type: 'WITHHOLDING_3_3', grossPay: 500_000, previousSent: [] }),
    ];
    const merged = mergeLines({
      current,
      fresh: [line({ calculatedAmount: 500_000, amount: 500_000 })],
      ...changed('WITHHOLDING_3_3', 'SOCIAL_INSURANCE'),
    });
    const deductions = merged.filter((l) => l.kind === 'DEDUCTION');
    expect(deductions.map((l) => l.code)).toEqual([
      'NATIONAL_PENSION',
      'HEALTH_INSURANCE',
      'LONG_TERM_CARE',
      'EMPLOYMENT_INSURANCE',
      'INCOME_TAX',
      'LOCAL_INCOME_TAX',
    ]);
    expect(deductions.every((l) => l.amount === 0 && l.calculatedAmount === null)).toBe(true);
  });

  it('NONE으로 바꾸면 공제 줄이 사라진다', () => {
    const current = [
      line({ calculatedAmount: 500_000, amount: 500_000 }),
      ...buildDeductionLines({ type: 'WITHHOLDING_3_3', grossPay: 500_000, previousSent: [] }),
    ];
    const merged = mergeLines({ current, fresh: [], ...changed('WITHHOLDING_3_3', 'NONE') });
    expect(merged.some((l) => l.kind === 'DEDUCTION')).toBe(false);
  });

  it('4대보험으로 바꾸면 previousSent의 직전 보낸 금액을 기본값으로 쓴다', () => {
    const current = [line({ calculatedAmount: 500_000, amount: 500_000 })];
    const previousSent = [line({ kind: 'DEDUCTION', code: 'NATIONAL_PENSION', calculatedAmount: null, amount: 40_000 })];
    const merged = mergeLines({ current, fresh: current, ...changed('NONE', 'SOCIAL_INSURANCE', previousSent) });
    const pension = merged.find((l) => l.code === 'NATIONAL_PENSION');
    expect([pension?.amount, pension?.basis, merged.find((l) => l.code === 'HEALTH_INSURANCE')?.amount]).toEqual([40_000, '직전 명세서 금액', 0]);
  });

  it('fresh의 공제 줄은 직전 보낸 금액으로 쓰지 않는다', () => {
    const fresh = [
      line({ calculatedAmount: 500_000, amount: 500_000 }),
      line({ kind: 'DEDUCTION', code: 'NATIONAL_PENSION', calculatedAmount: null, amount: 40_000 }),
    ];
    const merged = mergeLines({ current: [], fresh, ...changed('NONE', 'SOCIAL_INSURANCE') });
    expect(merged.find((l) => l.code === 'NATIONAL_PENSION')?.amount).toBe(0);
  });

  it('같은 3.3%면 새 지급 총액으로 다시 계산한다', () => {
    const current = [
      line({ calculatedAmount: 500_000, amount: 500_000 }),
      ...buildDeductionLines({ type: 'WITHHOLDING_3_3', grossPay: 500_000, previousSent: [] }),
    ];
    const fresh = [line({ calculatedAmount: 1_000_000, amount: 1_000_000 })];
    const deductions = mergeLines({ current, fresh, ...same('WITHHOLDING_3_3') }).filter((l) => l.kind === 'DEDUCTION');
    expect(deductions.map((l) => [l.code, l.amount, l.calculatedAmount])).toEqual([
      ['INCOME_TAX', 30_000, 30_000],
      ['LOCAL_INCOME_TAX', 3_000, 3_000],
    ]);
  });

  it('3.3% 줄을 직접 고쳤다면 금액을 유지하고 계산값만 바꾼다', () => {
    const [income, local] = buildDeductionLines({ type: 'WITHHOLDING_3_3', grossPay: 500_000, previousSent: [] });
    const current: LineDraft[] = [
      line({ calculatedAmount: 500_000, amount: 500_000 }),
      line({ ...income, amount: 12_000, adjustReason: '실제 원천징수액' }),
      line({ ...local }),
    ];
    const fresh = [line({ calculatedAmount: 1_000_000, amount: 1_000_000 })];
    const deductions = mergeLines({ current, fresh, ...same('WITHHOLDING_3_3') }).filter((l) => l.kind === 'DEDUCTION');
    expect(deductions[0]).toMatchObject({ amount: 12_000, calculatedAmount: 30_000 });
  });

  it('4대보험 수기 금액은 같은 방식이면 그대로 둔다', () => {
    const current = [
      line({ calculatedAmount: 500_000, amount: 500_000 }),
      ...buildDeductionLines({ type: 'SOCIAL_INSURANCE', grossPay: 500_000, previousSent: [] }).map((l) => ({ ...l, amount: 1_000 })),
    ];
    const merged = mergeLines({ current, fresh: [line({ calculatedAmount: 800_000, amount: 800_000 })], ...same('SOCIAL_INSURANCE') });
    expect(merged.filter((l) => l.kind === 'DEDUCTION').every((l) => l.amount === 1_000 && l.calculatedAmount === null)).toBe(true);
  });
});

describe('totalsOf', () => {
  it('지급-공제', () => {
    const lines = [line({ amount: 500_000 }), line({ kind: 'DEDUCTION', code: 'INCOME_TAX', amount: 16_500 })];
    expect(totalsOf(lines)).toEqual({ grossPay: 500_000, totalDeduction: 16_500, netPay: 483_500 });
  });
});

describe('hasCalculatedChange', () => {
  it('계산값이 같으면 false, 조정·CUSTOM은 보지 않는다', () => {
    const current = [line({ calculatedAmount: 100, amount: 999, adjustReason: '조정' }), line({ code: 'CUSTOM', calculatedAmount: null, amount: 5 })];
    expect(hasCalculatedChange(current, [line({ calculatedAmount: 100, amount: 100 })])).toBe(false);
  });

  it('계산값이 다르거나 줄이 생기고 사라지면 true', () => {
    const base = [line({ calculatedAmount: 100, amount: 100 })];
    expect(hasCalculatedChange(base, [line({ calculatedAmount: 101, amount: 101 })])).toBe(true);
    expect(hasCalculatedChange(base, [...base, line({ code: 'NIGHT_PREMIUM', calculatedAmount: 10, amount: 10 })])).toBe(true);
    expect(hasCalculatedChange(base, [])).toBe(true);
  });

  it('공제 줄 변화는 무시한다', () => {
    const current = [line({ calculatedAmount: 100, amount: 100 })];
    const fresh = [...current, line({ kind: 'DEDUCTION', code: 'INCOME_TAX', calculatedAmount: 3, amount: 3 })];
    expect(hasCalculatedChange(current, fresh)).toBe(false);
  });
});

describe('summaryOf', () => {
  it('근로일수·시간 요약을 옮긴다', () => {
    const summary = summaryOf(
      member({
        workDays: 12,
        recognizedSeconds: 3600,
        allowances: { ...NO_ALLOWANCES, overtimeSeconds: 1, nightSeconds: 2, holidaySeconds: 3 },
      }),
    );
    expect(summary).toEqual({ workDays: 12, recognizedSeconds: 3600, overtimeSeconds: 1, nightSeconds: 2, holidaySeconds: 3 });
  });
});
