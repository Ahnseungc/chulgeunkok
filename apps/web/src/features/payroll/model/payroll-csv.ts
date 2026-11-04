/**
 * 정산 CSV (순수 함수). 정본: docs/specs/payroll §5
 * - UTF-8 BOM: 엑셀에서 한글이 깨지지 않게
 * - `= + - @`로 시작하는 셀은 앞에 `'`: 엑셀이 수식으로 실행하지 않게 (CSV 인젝션)
 */

const BOM = '﻿';
const LINE_BREAK = '\r\n';
const FORMULA_PREFIX = /^[=+\-@\t\r]/;
const MINUTE_SECONDS = 60;

export type CsvCell = string | number;

export function escapeCsvCell(value: CsvCell): string {
  const text = String(value);
  const guarded = typeof value === 'string' && FORMULA_PREFIX.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

export function toCsv(header: readonly string[], rows: readonly (readonly CsvCell[])[]): string {
  return BOM + [header, ...rows].map((row) => row.map(escapeCsvCell).join(',')).join(LINE_BREAK) + LINE_BREAK;
}

/** 초 → 분 (내림). 화면 표시와 같다 (docs/specs/payroll §3.4) */
export const toMinutes = (seconds: number) => Math.floor(seconds / MINUTE_SECONDS);

/** 초 → "45:30" */
export const toHourMinute = (seconds: number) => {
  const minutes = toMinutes(seconds);
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
};

/** `출근콕_<매장명>_<YYYYMMDD>-<YYYYMMDD>.csv` (끝 날짜는 기간 마지막 날) */
export function payrollCsvFileName(input: { storeName: string; start: string; end: string; detail: boolean }) {
  const lastDay = new Date(Date.parse(`${input.end}T00:00:00Z`) - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const compact = (date: string) => date.replace(/-/g, '');
  const safeStoreName = input.storeName.replace(/[\\/:*?"<>|]/g, '');
  return `출근콕_${safeStoreName}_${compact(input.start)}-${compact(lastDay)}${input.detail ? '_상세' : ''}.csv`;
}
