import MemberDetailScreen from '@/features/staff/ui/MemberDetailScreen';

interface MemberDetailPageProps {
  params: Promise<{ storeId: string; memberId: string }>;
}

export default async function MemberDetailPage({ params }: MemberDetailPageProps) {
  const { storeId, memberId } = await params;
  return <MemberDetailScreen storeId={storeId} memberId={memberId} />;
}
