import type { PeriodWithNav } from '@/features/payroll/model/work-time';

import type { AttendanceBreakDto, AttendanceStatus } from './punch-types';

/** 관리자 근태 목록 한 줄. docs/specs/attendance §8 */
export interface AttendanceRowDto {
  id: string;
  memberId: string;
  name: string;
  localDate: string;
  clockInAt: string;
  clockOutAt: string | null;
  status: AttendanceStatus;
  outsideArea: boolean | null;
  breakWaived: boolean;
  revised: boolean;
  /** CLOSED 근무만. 이 기간 안 부분 */
  workedSeconds: number;
  breakSeconds: number;
  recognizedSeconds: number;
  breakNotScheduled: boolean;
}

export interface AttendanceListDto {
  period: PeriodWithNav;
  rows: AttendanceRowDto[];
}

export interface AttendanceRevisionDto {
  id: string;
  actorName: string;
  reason: string;
  before: AttendanceSnapshot | null;
  after: AttendanceSnapshot;
  createdAt: string;
}

export interface AttendanceSnapshot {
  clockInAt: string;
  clockOutAt: string | null;
  status: AttendanceStatus;
  breakWaived: boolean;
}

export type CorrectionType = 'TIME' | 'BREAK_WAIVED' | 'MISSING_CLOCK_OUT';
export type CorrectionStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELED';

/** 직원 수정 요청. docs/specs/attendance §7 */
export interface CorrectionDto {
  id: string;
  attendanceId: string;
  memberId: string;
  memberName: string;
  type: CorrectionType;
  proposedClockInAt: string | null;
  proposedClockOutAt: string | null;
  reason: string;
  status: CorrectionStatus;
  decisionNote: string | null;
  createdAt: string;
  decidedAt: string | null;
  attendance: { clockInAt: string; clockOutAt: string | null; status: AttendanceStatus };
}

export interface AttendanceDetailDto extends AttendanceRowDto {
  /** 직원이 남긴 휴게, 시작 순. 있으면 정산은 소정 휴게 대신 이것을 뺀다 (docs/specs/attendance §3.6) */
  breaks: AttendanceBreakDto[];
  revisions: AttendanceRevisionDto[];
  corrections: CorrectionDto[];
}
