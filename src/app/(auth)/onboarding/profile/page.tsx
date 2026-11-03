import ScreenPlaceholder from '@/shared/ui/ScreenPlaceholder';

export default function OnboardingProfilePage() {
  return (
    <ScreenPlaceholder
      title="프로필 입력"
      spec="docs/specs/auth/README.md §7"
      summary="이름, 휴대폰 인증, 개인정보 수집·이용 고지"
    />
  );
}
