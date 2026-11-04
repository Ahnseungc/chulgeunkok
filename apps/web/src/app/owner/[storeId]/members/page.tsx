import MembersScreen from '@/features/staff/ui/MembersScreen';

interface MembersPageProps {
  params: Promise<{ storeId: string }>;
}

export default async function MembersPage({ params }: MembersPageProps) {
  const { storeId } = await params;
  return <MembersScreen storeId={storeId} />;
}
