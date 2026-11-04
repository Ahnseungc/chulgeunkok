import PayrollScreen from '@/features/payroll/ui/PayrollScreen';

interface PayrollPageProps {
  params: Promise<{ storeId: string }>;
}

/** 정산 — docs/specs/payroll/README.md §6 */
export default async function PayrollPage({ params }: PayrollPageProps) {
  const { storeId } = await params;
  return <PayrollScreen storeId={storeId} />;
}
