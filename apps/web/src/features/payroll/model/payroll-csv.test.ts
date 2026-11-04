import { describe, expect, it } from 'vitest';

import { escapeCsvCell, payrollCsvFileName, toCsv, toHourMinute } from './payroll-csv';

describe('escapeCsvCell', () => {
  it('수식으로 시작하는 문자열 앞에 작은따옴표를 붙인다', () => {
    expect(escapeCsvCell('=HYPERLINK("http://x")')).toBe('"\'=HYPERLINK(""http://x"")"');
  });

  it.each(['+1', '-1', '@SUM(A1)'])('%s 도 막는다', (value) => {
    expect(escapeCsvCell(value).startsWith("'")).toBe(true);
  });

  it('숫자 음수는 그대로 둔다', () => {
    expect(escapeCsvCell(-1)).toBe('-1');
  });

  it('쉼표·줄바꿈이 있으면 따옴표로 감싼다', () => {
    expect(escapeCsvCell('김, 알바')).toBe('"김, 알바"');
  });
});

describe('toCsv', () => {
  it('엑셀 한글용 BOM과 CRLF를 쓴다', () => {
    expect(toCsv(['이름'], [['김알바']])).toBe('﻿이름\r\n김알바\r\n');
  });
});

describe('toHourMinute', () => {
  it('45시간 30분', () => {
    expect(toHourMinute((45 * 60 + 30) * 60 + 59)).toBe('45:30');
  });
});

describe('payrollCsvFileName', () => {
  it('끝 날짜는 기간 마지막 날이다', () => {
    expect(payrollCsvFileName({ storeName: '골목카페', start: '2026-11-01', end: '2026-12-01', detail: false })).toBe(
      '출근콕_골목카페_20261101-20261130.csv',
    );
  });

  it('파일 이름에 쓸 수 없는 문자를 지운다', () => {
    expect(payrollCsvFileName({ storeName: 'A/B:카페', start: '2026-11-01', end: '2026-12-01', detail: true })).toBe(
      '출근콕_AB카페_20261101-20261130_상세.csv',
    );
  });
});
