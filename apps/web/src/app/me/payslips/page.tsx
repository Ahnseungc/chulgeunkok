import MyPayslipsScreen from '@/features/payslip/ui/MyPayslipsScreen';

interface MyPayslipsPageProps {
  searchParams: Promise<{ storeId?: string }>;
}

/** 직원 임금명세서 목록 — docs/specs/payslip/README.md §5.3 */
export default async function MyPayslipsPage({ searchParams }: MyPayslipsPageProps) {
  const { storeId } = await searchParams;
  return <MyPayslipsScreen storeId={storeId} />;
}
