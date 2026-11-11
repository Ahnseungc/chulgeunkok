import PayslipsScreen from '@/features/payslip/ui/PayslipsScreen';

interface PayslipsPageProps {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<{ periodStart?: string }>;
}

/** 임금명세서 목록 — docs/specs/payslip/README.md §5.1 */
export default async function PayslipsPage({ params, searchParams }: PayslipsPageProps) {
  const [{ storeId }, query] = await Promise.all([params, searchParams]);
  return <PayslipsScreen storeId={storeId} initialPeriodStart={query.periodStart} />;
}
