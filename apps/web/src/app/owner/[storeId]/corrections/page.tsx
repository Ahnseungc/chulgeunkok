import CorrectionsScreen from '@/features/attendance/ui/CorrectionsScreen';

interface CorrectionsPageProps {
  params: Promise<{ storeId: string }>;
}

/** 직원 수정 요청 — docs/specs/attendance/README.md §7.3 */
export default async function CorrectionsPage({ params }: CorrectionsPageProps) {
  const { storeId } = await params;
  return <CorrectionsScreen storeId={storeId} />;
}
