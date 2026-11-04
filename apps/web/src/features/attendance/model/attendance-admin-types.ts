import type { PeriodWithNav } from '@/features/payroll/model/work-time';

import type { AttendanceStatus } from './punch-types';

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

export interface AttendanceDetailDto extends AttendanceRowDto {
  revisions: AttendanceRevisionDto[];
}
