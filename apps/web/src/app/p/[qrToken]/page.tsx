import PunchScreen from '@/features/attendance/ui/PunchScreen';

interface PunchPageProps {
  params: Promise<{ qrToken: string }>;
}

/** 매장 QR 스캔 진입점. 토큰 검증·판별은 클라이언트가 punch-preview로 한다 */
export default async function PunchPage({ params }: PunchPageProps) {
  const { qrToken } = await params;
  return <PunchScreen qrToken={qrToken} />;
}
