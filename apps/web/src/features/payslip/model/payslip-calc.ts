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

/** 시급이 하나뿐이면 그 시급. 여럿이면 항목별 시급을 DTO로 알 수 없어 null (§3.2) */
const singleWageOf = (member: PayrollMemberDto): number | null =>
  member.byWage.length === 1 ? (member.byWage[0]?.hourlyWage ?? null) : null;

/** `3시간` → `3시간 × 10,320원`. 시급을 모르면 그대로 */
const timesWage = (seconds: number, wage: number | null) =>
  wage === null ? formatDuration(seconds) : `${formatDuration(seconds)} × ${formatWon(wage)}`;

/** 주휴·유급휴일 basis: 1일 소정시간이 DTO에 없어 곱셈식 대신 `4주 · 시급 10,320원` */
const countBasis = (count: string, wage: number | null) => (wage === null ? count : `${count} · 시급 ${formatWon(wage)}`);

/** 수당 줄 basis. 데이터에 있는 값(시간·주수·일수·단일 시급)만 쓴다 (§3.2) */
function allowanceBases(member: PayrollMemberDto): Record<Exclude<(typeof EARNING_CODES)[number], 'BASE_PAY'>, string> {
  const { allowances } = member;
  const wage = singleWageOf(member);
  return {
    WEEKLY_HOLIDAY_PAY: countBasis(`${allowances.weeklyHolidayWeeks}주`, wage),
    OVERTIME_PREMIUM: `${timesWage(allowances.overtimeSeconds, wage)} × 0.5`,
    NIGHT_PREMIUM: `${timesWage(allowances.nightSeconds, wage)} × 0.5`,
    HOLIDAY_PREMIUM: `${timesWage(allowances.holidaySeconds, wage)} (8시간까지 × 0.5, 넘는 분 × 1.0)`,
    PAID_HOLIDAY_PAY: countBasis(`${allowances.paidHolidayDays}일`, wage),
  };
}

/**
 * 직원 1명의 정산 미리보기 → 지급 줄 (§3.2). 0원 항목은 만들지 않는다.
 * DTO에 없는 값(1일 소정시간·여러 시급일 때 항목별 시급)은 넣지 않는다.
 */
export function buildEarningLines(member: PayrollMemberDto): LineDraft[] {
  const { allowances } = member;
  const bases = allowanceBases(member);
  const candidates: [(typeof EARNING_CODES)[number], number, string][] = [
    [
      'BASE_PAY',
      member.basePayEstimate,
      member.byWage.map((w) => `${formatDuration(w.recognizedSeconds)} × ${formatWon(w.hourlyWage)}`).join('\n'),
    ],
    ['WEEKLY_HOLIDAY_PAY', allowances.weeklyHolidayPay, bases.WEEKLY_HOLIDAY_PAY],
    ['OVERTIME_PREMIUM', allowances.overtimePremium, bases.OVERTIME_PREMIUM],
    ['NIGHT_PREMIUM', allowances.nightPremium, bases.NIGHT_PREMIUM],
    ['HOLIDAY_PREMIUM', allowances.holidayPremium, bases.HOLIDAY_PREMIUM],
    ['PAID_HOLIDAY_PAY', allowances.paidHolidayPay, bases.PAID_HOLIDAY_PAY],
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

/** 공제 방식 전환·재계산에 쓰는 입력 (§3.3) */
interface DeductionMergeInput {
  /** 지금 명세서에 저장된 공제 방식 (`Payslip.deductionType`) */
  currentDeductionType: DeductionType;
  /** 적용할 공제 방식 */
  deductionType: DeductionType;
  /** 같은 직원의 직전 보낸 명세서 줄. 4대보험 묶음을 새로 만들 때 기본값 */
  previousSent: readonly LineDraft[];
}

function mergeDeductions(current: readonly LineDraft[], grossPay: number, input: DeductionMergeInput): LineDraft[] {
  const { deductionType } = input;
  if (input.currentDeductionType !== deductionType) {
    const custom = current.filter((l) => l.code === CUSTOM_CODE);
    return [...buildDeductionLines({ type: deductionType, grossPay, previousSent: input.previousSent }), ...custom];
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
 * - CUSTOM·수기 공제(calculatedAmount null)는 그대로 둔다. fresh의 공제 줄은 보지 않는다.
 * - currentDeductionType ≠ deductionType 이면 공제 줄 묶음을 새로 만든다 (4대보험 기본값은 previousSent).
 *   같으면 3.3% 줄만 새 지급 총액으로 다시 계산한다.
 */
export function mergeLines(
  input: { current: readonly LineDraft[]; fresh: readonly LineDraft[] } & DeductionMergeInput,
): LineDraft[] {
  const earnings = resequence(
    mergeEarnings(
      input.current.filter((l) => l.kind === 'EARNING'),
      input.fresh,
    ),
    earningRank,
  );
  const currentDeductions = input.current.filter((l) => l.kind === 'DEDUCTION');
  const deductions = resequence(mergeDeductions(currentDeductions, totalsOf(earnings).grossPay, input), deductionRank);
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
