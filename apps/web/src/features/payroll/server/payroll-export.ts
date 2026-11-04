import { formatClock } from '@/shared/lib/format-time';

import { toCsv, toHourMinute, toMinutes, type CsvCell } from '../model/payroll-csv';

import type { PayrollPreviewWithRows } from './payroll-service';

const STATUS_LABEL = { ACTIVE: '재직', INACTIVE: '퇴사' } as const;
const ATTENDANCE_STATUS_LABEL = {
  OPEN: '근무 중',
  CLOSED: '정상',
  MISSING_CLOCK_OUT: '퇴근 누락',
  VOID: '무효',
} as const;

const SUMMARY_HEADER = [
  '이름',
  '휴대폰 뒤 4자리',
  '상태',
  '근무 일수',
  '인정 근무시간(분)',
  '인정 근무시간',
  '적용 시급',
  '예상 기본급(원)',
  '퇴근 누락 건수',
  '대기 중 수정 요청',
  '검토 필요 항목',
] as const;

const DETAIL_HEADER = [
  '이름',
  '날짜',
  '출근',
  '퇴근',
  '근무(분)',
  '휴게 차감(분)',
  '인정(분)',
  '시급',
  '상태',
  '수정 여부',
  '매장 밖 여부',
] as const;

/** 직원별 요약 (docs/specs/payroll §5.1) */
export function buildSummaryCsv(payroll: PayrollPreviewWithRows): string {
  const rows: CsvCell[][] = payroll.preview.members.map((member) => [
    member.name,
    payroll.phoneLast4ByMember.get(member.memberId) ?? '',
    STATUS_LABEL[member.status],
    member.workDays,
    toMinutes(member.recognizedSeconds),
    toHourMinute(member.recognizedSeconds),
    member.byWage.map((wage) => wage.hourlyWage).join('/'),
    member.basePayEstimate,
    member.flags.missingClockOutCount,
    member.flags.pendingCorrectionCount,
    member.flags.openLaborReviewCount,
  ]);
  return toCsv(SUMMARY_HEADER, rows);
}

/** 근무별 상세 (docs/specs/payroll §5.2). 오래된 순 */
export function buildDetailCsv(payroll: PayrollPreviewWithRows): string {
  const rows: CsvCell[][] = [...payroll.rows].reverse().map((row) => {
    const sum = (key: 'workedSeconds' | 'breakSeconds' | 'recognizedSeconds') =>
      row.segments.reduce((total, segment) => total + segment[key], 0);
    const { attendance } = row;
    return [
      attendance.membership.user.name,
      row.localDate,
      formatClock(attendance.clockInAt.toISOString()),
      attendance.clockOutAt ? formatClock(attendance.clockOutAt.toISOString()) : '',
      toMinutes(sum('workedSeconds')),
      toMinutes(sum('breakSeconds')),
      toMinutes(sum('recognizedSeconds')),
      attendance.terms.hourlyWage,
      ATTENDANCE_STATUS_LABEL[attendance.status],
      attendance._count.revisions > 0 ? '수정됨' : '',
      attendance.clockInOutsideArea ? '매장 밖' : '',
    ];
  });
  return toCsv(DETAIL_HEADER, rows);
}
