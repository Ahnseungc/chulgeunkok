/** 서버·클라이언트 공용 출퇴근 타입. docs/specs/attendance §3 */

export const PUNCH_ACTIONS = ['CLOCK_IN', 'CLOCK_OUT'] as const;
export type PunchAction = (typeof PUNCH_ACTIONS)[number];

export const ATTENDANCE_STATUSES = ['OPEN', 'CLOSED', 'MISSING_CLOCK_OUT', 'VOID'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

/** 직원에게 보이는 근태. 위치·매장 밖 여부는 관리자 화면 전용이라 넣지 않는다 */
export interface AttendanceDto {
  id: string;
  storeId: string;
  clockInAt: string;
  clockOutAt: string | null;
  status: AttendanceStatus;
}

export interface PunchPreviewDto {
  store: { id: string; name: string };
  nextAction: PunchAction;
  openAttendance: { id: string; clockInAt: string } | null;
  serverNow: string;
}

export interface PunchResultDto {
  action: PunchAction;
  attendance: AttendanceDto;
}

/** 직원이 남긴 휴게 한 번. 끝이 null이면 휴게 중 (docs/specs/attendance §3.6) */
export interface AttendanceBreakDto {
  id: string;
  startAt: string;
  endAt: string | null;
}

/** POST /attendance/break/start · /attendance/break/end 응답 */
export interface BreakResultDto {
  attendanceId: string;
  break: AttendanceBreakDto;
}
