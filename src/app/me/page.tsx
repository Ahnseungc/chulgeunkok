import ScreenPlaceholder from '@/shared/ui/ScreenPlaceholder';

export default function MyPage() {
  return (
    <ScreenPlaceholder
      title="내 근무"
      spec="docs/specs/attendance/README.md §8"
      summary="오늘 상태, 이번 정산기간 근무 목록·합계, 퇴근 누락 카드, 수정 요청 상태"
    />
  );
}
