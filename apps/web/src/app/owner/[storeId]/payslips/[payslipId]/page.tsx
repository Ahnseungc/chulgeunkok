import PayslipDetailScreen from '@/features/payslip/ui/PayslipDetailScreen';

interface PayslipDetailPageProps {
  params: Promise<{ storeId: string; payslipId: string }>;
}

/** 임금명세서 상세 — docs/specs/payslip/README.md §5.2 */
export default async function PayslipDetailPage({ params }: PayslipDetailPageProps) {
  const { storeId, payslipId } = await params;
  return <PayslipDetailScreen storeId={storeId} payslipId={payslipId} />;
}
