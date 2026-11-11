'use client';

import { type Activity, StackRouterProvider, useActivity, useParams } from '@ahnseungchan/webviewkit';
import { useMemo } from 'react';

import AttendanceDetailScreen from '@/features/attendance/ui/AttendanceDetailScreen';
import AttendancesScreen from '@/features/attendance/ui/AttendancesScreen';
import CorrectionsScreen from '@/features/attendance/ui/CorrectionsScreen';
import DashboardScreen from '@/features/dashboard/ui/DashboardScreen';
import TermsFormScreen from '@/features/labor/ui/TermsFormScreen';
import PayrollScreen from '@/features/payroll/ui/PayrollScreen';
import PayslipDetailScreen from '@/features/payslip/ui/PayslipDetailScreen';
import PayslipsScreen from '@/features/payslip/ui/PayslipsScreen';
import MemberDetailScreen from '@/features/staff/ui/MemberDetailScreen';
import MembersScreen from '@/features/staff/ui/MembersScreen';
import SettingsScreen from '@/features/store/ui/SettingsScreen';
import { useIsIosApp } from '@/shared/lib/app-shell';

interface OwnerStackAppProps {
  storeId: string;
}

const Attendances = ({ storeId }: OwnerStackAppProps) => {
  const { query } = useActivity();
  return (
    <AttendancesScreen
      storeId={storeId}
      initialMemberId={query.memberId}
      initialStatus={query.status}
      initialPeriodStart={query.periodStart}
    />
  );
};

const AttendanceDetail = ({ storeId }: OwnerStackAppProps) => {
  const { attendanceId } = useParams<{ attendanceId: string }>();
  return <AttendanceDetailScreen storeId={storeId} attendanceId={attendanceId} />;
};

const MemberDetail = ({ storeId }: OwnerStackAppProps) => {
  const { memberId } = useParams<{ memberId: string }>();
  return <MemberDetailScreen storeId={storeId} memberId={memberId} />;
};

const Terms = ({ storeId }: OwnerStackAppProps) => {
  const { memberId } = useParams<{ memberId: string }>();
  return <TermsFormScreen storeId={storeId} memberId={memberId} />;
};

const PayslipDetail = ({ storeId }: OwnerStackAppProps) => {
  const { payslipId } = useParams<{ payslipId: string }>();
  return <PayslipDetailScreen storeId={storeId} payslipId={payslipId} />;
};

/**
 * 매장 화면(/owner/[storeId]/**)을 앱처럼 스택으로 쌓는다.
 * 목록 화면은 keepAlive 로 back 뒤 다시 열어도 스크롤·필터를 유지한다.
 */
export default function OwnerStackApp({ storeId }: OwnerStackAppProps) {
  const base = `/owner/${storeId}`;
  const { initialActivity, activities } = useMemo(() => {
    const dashboard: Activity = { path: base, element: <DashboardScreen storeId={storeId} /> };
    const list: Activity[] = [
      { path: '/owner/:storeId/attendances', element: <Attendances storeId={storeId} />, keepAlive: true },
      { path: '/owner/:storeId/attendances/:attendanceId', element: <AttendanceDetail storeId={storeId} /> },
      { path: '/owner/:storeId/members', element: <MembersScreen storeId={storeId} />, keepAlive: true },
      { path: '/owner/:storeId/members/:memberId', element: <MemberDetail storeId={storeId} /> },
      { path: '/owner/:storeId/members/:memberId/terms', element: <Terms storeId={storeId} /> },
      { path: '/owner/:storeId/payroll', element: <PayrollScreen storeId={storeId} />, keepAlive: true },
      { path: '/owner/:storeId/payslips', element: <PayslipsScreen storeId={storeId} />, keepAlive: true },
      { path: '/owner/:storeId/payslips/:payslipId', element: <PayslipDetail storeId={storeId} /> },
      { path: '/owner/:storeId/corrections', element: <CorrectionsScreen storeId={storeId} /> },
      { path: '/owner/:storeId/settings', element: <SettingsScreen storeId={storeId} /> },
    ];
    return { initialActivity: dashboard, activities: list };
  }, [base, storeId]);
  // iOS 앱은 엣지 스와이프 back 을 WKWebView 가 이미 슬라이드한다. popstate 전환까지 애니메이션하면 두 번 밀린다
  const iosApp = useIsIosApp();

  return (
    <StackRouterProvider
      initialActivity={initialActivity}
      Activities={activities}
      maxWidth="100%"
      popStateTransition={iosApp ? 'none' : 'animate'}
    />
  );
}
