import type { PeriodWithNav } from '@/features/payroll/model/work-time';

import type { AttendanceRowDto, CorrectionType } from './attendance-admin-types';

/** GET /attendance/me 응답 */
export interface MyAttendancesDto {
  store: { id: string; name: string };
  period: PeriodWithNav;
  working: { attendanceId: string; clockInAt: string } | null;
  summary: { recognizedSeconds: number; basePayEstimate: number; workDays: number };
  rows: (AttendanceRowDto & { pendingCorrection: CorrectionType | null })[];
}

/** "휴게 못 함" 요청 기본 사유 (docs/specs/attendance §7.2) */
export const DEFAULT_BREAK_WAIVED_REASON = '바빠서 휴게시간을 못 썼어요';
