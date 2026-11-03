import InviteScreen from '@/features/staff/ui/InviteScreen';

interface InvitePageProps {
  params: Promise<{ token: string }>;
}

/** 초대 링크 진입점. RN 앱에서는 딥링크가 웹뷰로 이 주소를 연다 (docs/specs/auth §6) */
export default async function InvitePage({ params }: InvitePageProps) {
  const { token } = await params;
  return <InviteScreen token={token} />;
}
