/**
 * 임금명세서 줄·공제·지급일 계산 (순수 함수). 정본: docs/specs/payslip §3.2·§3.3·§3.4·§4.3
 * 3.3% 계산식과 절사 단위는 설계 가정이다 (인덱스 Q6, 세무 검토 필요).
 */

import type { DeductionType } from '@chulgeunkok/db';

import { toMinutes } from '@/features/payroll/model/payroll-csv';
import { formatWon, type PayrollMemberDto } from '@/features/payroll/model/payroll-types';

import {
  CUSTOM_CODE,
  EARNING_CODES,
  SOCIAL_INSURANCE_CODES,
  type LineDraft,
  type PayslipSummary,
  type PayslipTotals,
} from './payslip-types';

const MINUTES_PER_HOUR = 60;
/** 10원 미만 절사 단위 (§3.3) */
const WON_TRUNCATE_UNIT = 10;
const INCOME_TAX_RATE = 0.03;
const LOCAL_TAX_RATE = 0.1;
const MONTHS_PER_YEAR = 12;

const EARNING_LABELS: Record<(typeof EARNING_CODES)[number], string> = {
  BASE_PAY: '기본급',
  WEEKLY_HOLIDAY_PAY: '주휴수당',
  OVERTIME_PREMIUM: '연장근로 가산',
  NIGHT_PREMIUM: '야간근로 가산',
  HOLIDAY_PREMIUM: '휴일근로 가산',
  PAID_HOLIDAY_PAY: '유급휴일수당',
};

const SOCIAL_INSURANCE_LABELS: Record<(typeof SOCIAL_INSURANCE_CODES)[number], string> = {
  NATIONAL_PENSION: '국민연금',
  HEALTH_INSURANCE: '건강보험',
  LONG_TERM_CARE: '노인장기요양보험',
  EMPLOYMENT_INSURANCE: '고용보험',
  INCOME_TAX: '소득세',
  LOCAL_INCOME_TAX: '지방소득세',
};

const truncateToTenWon = (amount: number) => Math.floor(amount / WON_TRUNCATE_UNIT) * WON_TRUNCATE_UNIT;

/** 초 → "45시간 30분". 분이 0이면 "3시간", 시간이 0이면 "30분" (분 단위 내림, 화면과 같다) */
const formatDuration = (seconds: number) => {
  const minutes = toMinutes(seconds);
  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  const rest = minutes % MINUTES_PER_HOUR;
  if (hours === 0) return `${rest}분`;
  return rest === 0 ? `${hours}시간` : `${hours}시간 ${rest}분`;
};

/** 3.3% 원천징수. 소득세 3% 10원 미만 절사, 지방소득세 = 소득세 10% 10원 미만 절사 (§3.3) */
export function calculateWithholding33(grossPay: number): { incomeTax: number; localIncomeTax: number } {
  const incomeTax = truncateToTenWon(grossPay * INCOME_TAX_RATE);
  return { incomeTax, localIncomeTax: truncateToTenWon(incomeTax * LOCAL_TAX_RATE) };
}

const lastDayOfMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();
const toIsoDate = (year: number, month: number, day: number) =>
  `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

/**
 * 지급일 기본값: 기간 끝(미포함) 이후 처음 오는 payDay, 그 달에 없는 날이면 말일 (§3.4).
 * 기간 끝 날짜 당일이 payDay면 그날로 본다. payDay 미설정이면 null.
 */
export function payDateFor(periodEnd: string, payDay: number | null): string | null {
  if (payDay === null) return null;
  const [year = 0, month = 1] = periodEnd.split('-').map(Number);
  const inMonth = toIsoDate(year, month, Math.min(payDay, lastDayOfMonth(year, month)));
  if (inMonth >= periodEnd) return inMonth;
  const nextYear = month === MONTHS_PER_YEAR ? year + 1 : year;
  const nextMonth = month === MONTHS_PER_YEAR ? 1 : month + 1;
  return toIsoDate(nextYear, nextMonth, Math.min(payDay, lastDayOfMonth(nextYear, nextMonth)));
}

const earningLine = (code: (typeof EARNING_CODES)[number], basis: string, amount: number): LineDraft => ({
  kind: 'EARNING',
  code,
  label: EARNING_LABELS[code],
  basis,
  calculatedAmount: amount,
  amount,
  adjustReason: null,
  sortOrder: EARNING_CODES.indexOf(code),
});

/**
 * 직원 1명의 정산 미리보기 → 지급 줄 (§3.2). 0원 항목은 만들지 않는다.
 * DTO에 없는 값(1일 소정시간·항목별 시급)은 넣지 않고 가진 값(주수·시간·일수)으로 basis를 만든다.
 */
export function buildEarningLines(member: PayrollMemberDto): LineDraft[] {
  const { allowances } = member;
  const candidates: [(typeof EARNING_CODES)[number], number, string][] = [
    [
      'BASE_PAY',
      member.basePayEstimate,
      member.byWage.map((w) => `${formatDuration(w.recognizedSeconds)} × ${formatWon(w.hourlyWage)}`).join('\n'),
    ],
    ['WEEKLY_HOLIDAY_PAY', allowances.weeklyHolidayPay, `${allowances.weeklyHolidayWeeks}주`],
    ['OVERTIME_PREMIUM', allowances.overtimePremium, `${formatDuration(allowances.overtimeSeconds)} × 0.5`],
    ['NIGHT_PREMIUM', allowances.nightPremium, `${formatDuration(allowances.nightSeconds)} × 0.5`],
    [
      'HOLIDAY_PREMIUM',
      allowances.holidayPremium,
      `${formatDuration(allowances.holidaySeconds)} (8시간까지 × 0.5, 넘는 분 × 1.0)`,
    ],
    ['PAID_HOLIDAY_PAY', allowances.paidHolidayPay, `${allowances.paidHolidayDays}일`],
  ];
  return candidates.filter(([, amount]) => amount > 0).map(([code, amount, basis]) => earningLine(code, basis, amount));
}

const deductionLine = (
  code: (typeof SOCIAL_INSURANCE_CODES)[number],
  fields: Pick<LineDraft, 'basis' | 'calculatedAmount' | 'amount'>,
): LineDraft => ({
  kind: 'DEDUCTION',
  code,
  label: SOCIAL_INSURANCE_LABELS[code],
  adjustReason: null,
  sortOrder: SOCIAL_INSURANCE_CODES.indexOf(code),
  ...fields,
});

const withholdingLines = (grossPay: number): LineDraft[] => {
  const { incomeTax, localIncomeTax } = calculateWithholding33(grossPay);
  return [
    deductionLine('INCOME_TAX', {
      basis: `${formatWon(grossPay)} × 3%`,
      calculatedAmount: incomeTax,
      amount: incomeTax,
    }),
    deductionLine('LOCAL_INCOME_TAX', {
      basis: `${formatWon(incomeTax)} × 10%`,
      calculatedAmount: localIncomeTax,
      amount: localIncomeTax,
    }),
  ];
};

/**
 * 공제 줄 묶음 (§3.3). 4대보험은 자동 계산 없이 직전 보낸 금액으로 채우고 없으면 0원,
 * `calculatedAmount`는 null (수기 공제).
 */
export function buildDeductionLines(input: {
  type: DeductionType;
  grossPay: number;
  previousSent: readonly LineDraft[];
}): LineDraft[] {
  if (input.type === 'NONE') return [];
  if (input.type === 'WITHHOLDING_3_3') return withholdingLines(input.grossPay);
  return SOCIAL_INSURANCE_CODES.map((code) => {
    const previous = input.previousSent.find((l) => l.kind === 'DEDUCTION' && l.code === code);
    return deductionLine(code, {
      basis: previous ? '직전 명세서 금액' : '',
      calculatedAmount: null,
      amount: previous?.amount ?? 0,
    });
  });
}

const isCalculated = (line: LineDraft) => line.calculatedAmount !== null && line.code !== CUSTOM_CODE;

/** 현재 공제 줄에서 공제 방식을 되짚는다. 4대보험 줄은 calculatedAmount가 null, 3.3% 줄은 값이 있다 */
function inferDeductionType(deductions: readonly LineDraft[]): DeductionType {
  if (deductions.some((l) => l.code === 'NATIONAL_PENSION')) return 'SOCIAL_INSURANCE';
  if (deductions.some((l) => l.code === 'INCOME_TAX' && l.calculatedAmount !== null)) return 'WITHHOLDING_3_3';
  return 'NONE';
}

const byCode = (lines: readonly LineDraft[]) => new Map(lines.map((l) => [l.code, l]));

/** 계산 줄을 fresh 기준으로 갱신. 조정(adjustReason)한 줄은 amount 유지 (§4.3) */
const refreshCalculated = (line: LineDraft, calculated: number, basis: string): LineDraft => ({
  ...line,
  basis,
  calculatedAmount: calculated,
  amount: line.adjustReason === null ? calculated : line.amount,
});

function mergeEarnings(current: readonly LineDraft[], fresh: readonly LineDraft[]): LineDraft[] {
  const freshByCode = byCode(fresh.filter((l) => l.kind === 'EARNING'));
  const kept = current.map((line) => {
    if (!isCalculated(line)) return line;
    const next = freshByCode.get(line.code);
    return next ? refreshCalculated(line, next.calculatedAmount ?? next.amount, next.basis) : refreshCalculated(line, 0, line.basis);
  });
  const currentCodes = new Set(current.map((l) => l.code));
  const added = [...freshByCode.values()].filter((l) => !currentCodes.has(l.code));
  return [...kept, ...added];
}

function mergeDeductions(input: {
  current: readonly LineDraft[];
  fresh: readonly LineDraft[];
  deductionType: DeductionType;
  grossPay: number;
}): LineDraft[] {
  const { current, deductionType, grossPay } = input;
  const custom = current.filter((l) => l.code === CUSTOM_CODE);
  if (inferDeductionType(current) !== deductionType) {
    const previousSent = input.fresh.filter((l) => l.kind === 'DEDUCTION');
    return [...buildDeductionLines({ type: deductionType, grossPay, previousSent }), ...custom];
  }
  if (deductionType !== 'WITHHOLDING_3_3') return [...current];
  const recalculated = byCode(withholdingLines(grossPay));
  return current.map((line) => {
    const next = recalculated.get(line.code);
    return next && isCalculated(line) ? refreshCalculated(line, next.amount, next.basis) : line;
  });
}

const earningRank = (line: LineDraft) => {
  const index = (EARNING_CODES as readonly string[]).indexOf(line.code);
  return index === -1 ? EARNING_CODES.length : index;
};
const deductionRank = (line: LineDraft) => {
  const index = (SOCIAL_INSURANCE_CODES as readonly string[]).indexOf(line.code);
  return index === -1 ? SOCIAL_INSURANCE_CODES.length : index;
};

const resequence = (lines: LineDraft[], rank: (line: LineDraft) => number): LineDraft[] =>
  [...lines]
    .sort((a, b) => rank(a) - rank(b) || a.sortOrder - b.sortOrder)
    .map((line, sortOrder) => ({ ...line, sortOrder }));

/**
 * 재계산 결과(fresh)를 현재 초안(current)에 합친다 (§4.3, §3.3).
 * - 계산 줄은 code로 짝지어 calculatedAmount 갱신, 조정 안 한 줄은 amount도 따라간다.
 * - fresh에서 사라진 계산 줄은 0원으로 남긴다.
 * - CUSTOM·수기 공제(calculatedAmount null)는 그대로 둔다.
 * - 공제 방식이 current 줄에서 읽은 방식과 다르면 공제 줄 묶음을 새로 만든다
 *   (4대보험 기본값은 fresh의 공제 줄을 직전 보낸 값으로 쓴다). 같으면 3.3% 줄만 새 지급 총액으로 다시 계산한다.
 */
export function mergeLines(input: {
  current: readonly LineDraft[];
  fresh: readonly LineDraft[];
  deductionType: DeductionType;
}): LineDraft[] {
  const earnings = resequence(
    mergeEarnings(
      input.current.filter((l) => l.kind === 'EARNING'),
      input.fresh,
    ),
    earningRank,
  );
  const grossPay = totalsOf(earnings).grossPay;
  const deductions = resequence(
    mergeDeductions({
      current: input.current.filter((l) => l.kind === 'DEDUCTION'),
      fresh: input.fresh,
      deductionType: input.deductionType,
      grossPay,
    }),
    deductionRank,
  );
  return [...earnings, ...deductions];
}

/** 지급 총액·공제 총액·실지급액 (§3.3) */
export function totalsOf(lines: readonly LineDraft[]): PayslipTotals {
  const sum = (kind: LineDraft['kind']) => lines.filter((l) => l.kind === kind).reduce((acc, l) => acc + l.amount, 0);
  const grossPay = sum('EARNING');
  const totalDeduction = sum('DEDUCTION');
  return { grossPay, totalDeduction, netPay: grossPay - totalDeduction };
}

/** 지급 계산 줄의 calculatedAmount가 하나라도 다르면 true. 한쪽에만 있는 줄은 0원으로 본다 (§4.3) */
export function hasCalculatedChange(current: readonly LineDraft[], fresh: readonly LineDraft[]): boolean {
  const amounts = (lines: readonly LineDraft[]) =>
    new Map(lines.filter((l) => l.kind === 'EARNING' && isCalculated(l)).map((l) => [l.code, l.calculatedAmount ?? 0]));
  const before = amounts(current);
  const after = amounts(fresh);
  return [...new Set([...before.keys(), ...after.keys()])].some((code) => (before.get(code) ?? 0) !== (after.get(code) ?? 0));
}

/** 명세서 근로일수·시간 요약 (§3.1) */
export const summaryOf = (member: PayrollMemberDto): PayslipSummary => ({
  workDays: member.workDays,
  recognizedSeconds: member.recognizedSeconds,
  overtimeSeconds: member.allowances.overtimeSeconds,
  nightSeconds: member.allowances.nightSeconds,
  holidaySeconds: member.allowances.holidaySeconds,
});
