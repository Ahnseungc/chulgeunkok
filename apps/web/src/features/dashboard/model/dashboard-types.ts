/** GET /stores/:storeId/dashboard 응답. 정본: docs/specs/dashboard §5 */
export interface DashboardDto {
  serverNow: string;
  store: { id: string; name: string };
  working: {
    attendanceId: string;
    memberId: string;
    name: string;
    clockInAt: string;
    outsideArea: boolean | null;
  }[];
  today: {
    clockedInCount: number;
    scheduledCount: number;
    notYetClockedIn: { memberId: string; name: string; scheduledStartAt: string }[];
  };
  todo: {
    termsMissing: number;
    missingClockOut: number;
    pendingCorrections: number;
    /** 권한(LABOR_REVIEW)이 없으면 null */
    laborReviews: number | null;
    pendingInvitations: number;
    /** 보내기 전 임금명세서 초안·정정본 (docs/specs/payslip §5.1). 사장님이 아니면 null */
    payslipDrafts: number | null;
  };
  currentPeriod: {
    start: string;
    end: string;
    recognizedSeconds: number;
    /** 권한(PAYROLL)이 없으면 null */
    basePayEstimate: number | null;
    /** 예상 주휴·가산·유급휴일수당 합 (docs/specs/payroll §3.6·§3.7). 권한(PAYROLL)이 없으면 null */
    allowanceEstimate: number | null;
  };
}
