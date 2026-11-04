import AttendancesScreen from '@/features/attendance/ui/AttendancesScreen';

interface AttendancesPageProps {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<{ memberId?: string; status?: string; periodStart?: string }>;
}

/** 근태 기록 — docs/specs/attendance/README.md §8 */
export default async function AttendancesPage({ params, searchParams }: AttendancesPageProps) {
  const [{ storeId }, query] = await Promise.all([params, searchParams]);
  return (
    <AttendancesScreen
      storeId={storeId}
      initialMemberId={query.memberId}
      initialStatus={query.status}
      initialPeriodStart={query.periodStart}
    />
  );
}
