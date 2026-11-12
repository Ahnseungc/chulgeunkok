import QrCardScreen from '@/features/qr-card/ui/QrCardScreen';

interface QrCardPageProps {
  params: Promise<{ storeId: string }>;
}

/** QR 카드 꾸미기 — docs/specs/qr-card/README.md §5 */
export default async function QrCardPage({ params }: QrCardPageProps) {
  const { storeId } = await params;
  return <QrCardScreen storeId={storeId} />;
}
