import OwnerStackApp from '@/features/owner-stack/ui/OwnerStackApp';

interface StoreLayoutProps {
  params: Promise<{ storeId: string }>;
  children: React.ReactNode;
}

/**
 * 매장 하위 화면은 OwnerStackApp 이 URL 을 보고 스택으로 그린다.
 * 각 page.tsx 는 새로고침·딥링크 때 Next 라우트가 존재하도록만 남겨 두고 그리지 않는다.
 */
export default async function StoreLayout({ params }: StoreLayoutProps) {
  const { storeId } = await params;
  return <OwnerStackApp storeId={storeId} />;
}
