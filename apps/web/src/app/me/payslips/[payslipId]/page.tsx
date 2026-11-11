import MyPayslipDetailScreen from '@/features/payslip/ui/MyPayslipDetailScreen';

interface MyPayslipPageProps {
  params: Promise<{ payslipId: string }>;
}

/** 직원 임금명세서 상세 — docs/specs/payslip/README.md §5.3 */
export default async function MyPayslipPage({ params }: MyPayslipPageProps) {
  const { payslipId } = await params;
  return <MyPayslipDetailScreen payslipId={payslipId} />;
}
