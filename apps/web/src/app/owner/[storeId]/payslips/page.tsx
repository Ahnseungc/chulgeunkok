import PayslipsScreen from '@/features/payslip/ui/PayslipsScreen';

interface PayslipsPageProps {
  params: Promise<{ storeId: string }>;
}

/** 임금명세서 목록 — docs/specs/payslip/README.md §5.1 */
export default async function PayslipsPage({ params }: PayslipsPageProps) {
  const { storeId } = await params;
  return <PayslipsScreen storeId={storeId} />;
}
