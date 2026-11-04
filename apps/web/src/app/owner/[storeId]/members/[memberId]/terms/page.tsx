import TermsFormScreen from '@/features/labor/ui/TermsFormScreen';

interface TermsPageProps {
  params: Promise<{ storeId: string; memberId: string }>;
}

/** 근로조건 등록·수정 — docs/specs/labor/README.md §7 */
export default async function TermsPage({ params }: TermsPageProps) {
  const { storeId, memberId } = await params;
  return <TermsFormScreen storeId={storeId} memberId={memberId} />;
}
