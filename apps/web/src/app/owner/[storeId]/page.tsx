import StoreHomeScreen from '@/features/store/ui/StoreHomeScreen';

interface StoreHomePageProps {
  params: Promise<{ storeId: string }>;
}

export default async function StoreHomePage({ params }: StoreHomePageProps) {
  const { storeId } = await params;
  return <StoreHomeScreen storeId={storeId} />;
}
