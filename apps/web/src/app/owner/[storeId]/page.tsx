import DashboardScreen from '@/features/dashboard/ui/DashboardScreen';

interface StoreHomePageProps {
  params: Promise<{ storeId: string }>;
}

/** 매장 홈 = 대시보드 — docs/specs/dashboard/README.md §3 */
export default async function StoreHomePage({ params }: StoreHomePageProps) {
  const { storeId } = await params;
  return <DashboardScreen storeId={storeId} />;
}
