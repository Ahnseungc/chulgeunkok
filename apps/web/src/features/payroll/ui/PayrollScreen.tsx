'use client';

import { ActionButton, Text } from '@seed-design/react';
import Link from 'next/link';
import { useState } from 'react';

import { formatDuration } from '@/shared/lib/format-time';
import { useApiResource } from '@/shared/lib/useApiResource';
import PeriodNav from '@/shared/ui/PeriodNav';
import Sheet from '@/shared/ui/Sheet';

import { PAYROLL_DISCLAIMER, type PayrollMemberDto, type PayrollPreviewDto } from '../model/payroll-types';

const SECOND_MS = 1000;

interface PayrollScreenProps {
  storeId: string;
}

const won = (amount: number) => `${amount.toLocaleString('ko-KR')}원`;

/** `/owner/[storeId]/payroll` — docs/specs/payroll §6 */
export default function PayrollScreen({ storeId }: PayrollScreenProps) {
  const [periodStart, setPeriodStart] = useState<string | undefined>();
  const [exportDetail, setExportDetail] = useState<boolean | null>(null);
  const query = periodStart ? `?periodStart=${periodStart}` : '';
  const { data, errorMessage } = useApiResource<PayrollPreviewDto>(`/api/v1/stores/${storeId}/payroll/preview${query}`);

  const exportUrl = (detail: boolean) =>
    `/api/v1/stores/${storeId}/payroll/export?periodStart=${data?.period.start ?? ''}${detail ? '&detail=1' : ''}`;
  const download = (detail: boolean) => {
    window.location.href = exportUrl(detail);
    setExportDetail(null);
  };
  const requestExport = (detail: boolean) => {
    // 미해결 항목이 있으면 빠진 근무가 있다는 걸 먼저 알린다 (docs/specs/payroll §5)
    if (data && (data.unresolved.missingClockOut > 0 || data.unresolved.pendingCorrections > 0)) setExportDetail(detail);
    else download(detail);
  };

  return (
    <main className="screen">
      <Link href={`/owner/${storeId}`} className="back-link">
        ← 매장 홈
      </Link>
      <Text as="h1" textStyle="t8Bold">
        정산
      </Text>
      {errorMessage ? (
        <Text as="p" textStyle="t5Regular" color="fg.critical" role="alert">
          {errorMessage}
        </Text>
      ) : null}
      {data ? (
        <>
          <PeriodNav period={data.period} onChange={setPeriodStart} />
          {data.unresolved.missingClockOut > 0 ? (
            <Link
              className="dash-card unresolved-banner"
              href={`/owner/${storeId}/attendances?status=MISSING_CLOCK_OUT&periodStart=${data.period.start}`}
            >
              <Text textStyle="t5Bold" color="fg.critical">
                퇴근 누락 {data.unresolved.missingClockOut}건이 정산에서 빠져 있어요
              </Text>
              <Text textStyle="t4Regular" color="fg.neutralMuted">
                눌러서 퇴근 시각을 넣어 주세요
              </Text>
            </Link>
          ) : null}
          <section className="dash-card" aria-label="합계">
            <Text textStyle="t4Regular" color="fg.neutralMuted">
              {data.totals.memberCount}명 · 인정 {formatDuration(data.totals.recognizedSeconds * SECOND_MS)}
            </Text>
            <Text textStyle="t8Bold">{won(data.totals.basePayEstimate)}</Text>
            <Text textStyle="t3Regular" color="fg.neutralMuted">
              {PAYROLL_DISCLAIMER}
            </Text>
          </section>
          <ul className="store-list">
            {data.members.map((member) => (
              <li key={member.memberId}>
                <MemberRow storeId={storeId} periodStart={data.period.start} member={member} />
              </li>
            ))}
          </ul>
          <div className="sheet__actions">
            <ActionButton variant="neutralWeak" size="large" flexGrow onClick={() => requestExport(true)}>
              근무별 CSV
            </ActionButton>
            <ActionButton variant="neutralSolid" size="large" flexGrow onClick={() => requestExport(false)}>
              직원별 CSV
            </ActionButton>
          </div>
          <Sheet open={exportDetail !== null} onClose={() => setExportDetail(null)} title="빠진 근무가 있어요">
            <Text as="p" textStyle="t5Regular" color="fg.neutralMuted">
              퇴근 누락 {data.unresolved.missingClockOut}건, 대기 중 수정 요청 {data.unresolved.pendingCorrections}건은 합계에
              들어가지 않아요. 그래도 내보낼까요?
            </Text>
            <div className="sheet__actions">
              <ActionButton variant="neutralWeak" size="large" flexGrow onClick={() => setExportDetail(null)}>
                취소
              </ActionButton>
              <ActionButton variant="neutralSolid" size="large" flexGrow onClick={() => download(exportDetail === true)}>
                내보내기
              </ActionButton>
            </div>
          </Sheet>
        </>
      ) : null}
    </main>
  );
}

function MemberRow({ storeId, periodStart, member }: { storeId: string; periodStart: string; member: PayrollMemberDto }) {
  const flags = [
    member.flags.openCount > 0 ? '근무 중' : null,
    member.flags.missingClockOutCount > 0 ? `퇴근 누락 ${member.flags.missingClockOutCount}` : null,
    member.flags.breakNotScheduledCount > 0 ? `휴게 미설정 ${member.flags.breakNotScheduledCount}` : null,
    member.flags.openLaborReviewCount > 0 ? `안내 ${member.flags.openLaborReviewCount}` : null,
    member.status === 'INACTIVE' ? '퇴사' : null,
  ].filter((flag): flag is string => flag !== null);
  return (
    <Link className="store-list__item" href={`/owner/${storeId}/attendances?memberId=${member.memberId}&periodStart=${periodStart}`}>
      <div className="payroll-row">
        <Text textStyle="t5Bold">{member.name}</Text>
        <Text textStyle="t5Bold">{won(member.basePayEstimate)}</Text>
      </div>
      <Text textStyle="t4Regular" color="fg.neutralMuted">
        {member.recognizedSeconds === 0
          ? '이 기간에 끝난 근무가 없어요'
          : `${member.workDays}일 · ${formatDuration(member.recognizedSeconds * SECOND_MS)} · 시급 ${member.byWage
              .map((wage) => won(wage.hourlyWage))
              .join(' → ')}`}
      </Text>
      {flags.length > 0 ? (
        <div className="badges">
          {flags.map((flag) => (
            <span key={flag} className="badge">
              {flag}
            </span>
          ))}
        </div>
      ) : null}
    </Link>
  );
}
