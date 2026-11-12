import type { AllowanceEstimate } from '@/features/payroll/model/allowances';
import type { PeriodWithNav } from '@/features/payroll/model/work-time';

import type { AttendanceRowDto, CorrectionType } from './attendance-admin-types';

/** GET /attendance/me 응답 */
export interface MyAttendancesDto {
  store: { id: string; name: string };
  period: PeriodWithNav;
  /** 경과 시간 계산 기준 (기기 시계가 틀려도 같게) */
  serverNow: string;
  /** breakStartedAt: 휴게 중이면 시작 시각 (docs/specs/attendance §3.6) */
  working: { attendanceId: string; clockInAt: string; breakStartedAt: string | null } | null;
  summary: { recognizedSeconds: number; basePayEstimate: number; allowances: AllowanceEstimate; workDays: number };
  rows: (AttendanceRowDto & { pendingCorrection: CorrectionType | null })[];
}

/** "휴게 못 함" 요청 기본 사유 (docs/specs/attendance §7.2) */
export const DEFAULT_BREAK_WAIVED_REASON = '바빠서 휴게시간을 못 썼어요';
