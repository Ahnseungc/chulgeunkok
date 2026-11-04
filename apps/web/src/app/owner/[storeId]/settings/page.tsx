import SettingsScreen from '@/features/store/ui/SettingsScreen';

interface SettingsPageProps {
  params: Promise<{ storeId: string }>;
}

/** 매장 설정 — docs/specs/store/README.md §7 */
export default async function SettingsPage({ params }: SettingsPageProps) {
  const { storeId } = await params;
  return <SettingsScreen storeId={storeId} />;
}
