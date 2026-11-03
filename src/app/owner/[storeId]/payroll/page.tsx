import ScreenPlaceholder from '@/shared/ui/ScreenPlaceholder';

export default function PayrollPage() {
  return (
    <ScreenPlaceholder
      title="정산"
      spec="docs/specs/payroll/README.md §6"
      summary="기간 선택, 미해결 배너, 합계, 직원별 시간·금액, CSV"
    />
  );
}
