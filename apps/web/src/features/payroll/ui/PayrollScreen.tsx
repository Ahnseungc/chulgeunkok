'use client';

import { useOnRevive } from '@ahnseungchan/webviewkit';
import { ActionButton, Text } from '@seed-design/react';
import { AnimatePresence } from 'framer-motion';
import { useState } from 'react';

import { formatDuration } from '@/shared/lib/format-time';
import { useApiResource } from '@/shared/lib/useApiResource';
import { CardStaggerList } from '@/shared/motion/CardStaggerList';
import { ExpandFadeReveal } from '@/shared/motion/ExpandFadeReveal';
import { PageStaggerEntrance, PageStaggerEntranceItem } from '@/shared/motion/PageStaggerEntrance';
import { SmoothCountUpNumber } from '@/shared/motion/SmoothCountUpNumber';
import { useIntroCountUp } from '@/shared/motion/useIntroCountUp';
import InlineAlert, { FLOW_REVEAL_CLASS, FLOW_REVEAL_GAP_PX } from '@/shared/ui/InlineAlert';
import PeriodNav from '@/shared/ui/PeriodNav';
import Sheet from '@/shared/ui/Sheet';

import {
  PAYROLL_DISCLAIMER,
  PREMIUM_NOT_APPLIED_NOTE,
  formatAllowanceBreakdown,
  formatWon as won,
  type PayrollMemberDto,
  type PayrollPreviewDto,
} from '../model/payroll-types';
import { AppLink } from '@/shared/ui/AppLink';
import ScreenHeader from '@/shared/ui/ScreenHeader';

const SECOND_MS = 1000;

interface PayrollScreenProps {
  storeId: string;
}

/** `/owner/[storeId]/payroll` — docs/specs/payroll §6 */
export default function PayrollScreen({ storeId }: PayrollScreenProps) {
  const [periodStart, setPeriodStart] = useState<string | undefined>();
  const [exportDetail, setExportDetail] = useState<boolean | null>(null);
  const query = periodStart ? `?periodStart=${periodStart}` : '';
  const { data, errorMessage, reload } = useApiResource<PayrollPreviewDto>(`/api/v1/stores/${storeId}/payroll/preview${query}`);
  // 스택에서 되살아나면 보관된 화면을 보여 준 채 최신 목록으로 다시 불러온다
  useOnRevive(() => void reload());
  // 처음 받은 합계만 카운트업. 되살아남 재조회·기간 이동으로 바뀐 값은 바로 바꾼다
  const estimateTotal = data ? data.totals.basePayEstimate + data.totals.allowanceEstimate : undefined;
  const totalIntro = useIntroCountUp(estimateTotal);

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
      <ScreenHeader backHref={`/owner/${storeId}`} backLabel="매장 홈" title="정산" />
      <Text as="h1" textStyle="t8Bold">
        정산
      </Text>
      <InlineAlert message={errorMessage} />
      {/* 기간은 합계와 같이 오지만 자리는 먼저 잡는다 */}
      <PeriodNav period={data?.period ?? null} onChange={setPeriodStart} />
      {data ? (
        <>
          {/* 기간을 옮겨 누락이 생기거나 사라져도 합계 카드를 툭 밀지 않는다 */}
          <AnimatePresence initial={false}>
            {data.unresolved.missingClockOut > 0 ? (
              <ExpandFadeReveal key="missing-banner" className={FLOW_REVEAL_CLASS} revealTopPadding={FLOW_REVEAL_GAP_PX}>
                <AppLink
                  className="dash-card unresolved-banner"
                  href={`/owner/${storeId}/attendances?status=MISSING_CLOCK_OUT&periodStart=${data.period.start}`}
                >
                  <Text textStyle="t5Bold" color="fg.critical">
                    퇴근 누락 {data.unresolved.missingClockOut}건이 정산에서 빠져 있어요
                  </Text>
                  <Text textStyle="t4Regular" color="fg.neutralMuted">
                    눌러서 퇴근 시각을 넣어 주세요
                  </Text>
                </AppLink>
              </ExpandFadeReveal>
            ) : null}
          </AnimatePresence>
          {/* 첫 조회 때만 내려온다. keepAlive 로 되살아나 재조회해도 다시 마운트되지 않아 재생하지 않는다 */}
          <PageStaggerEntrance className="motion-contents">
            <PageStaggerEntranceItem>
              <section className="dash-card" aria-label="합계">
                <Text textStyle="t4Regular" color="fg.neutralMuted">
                  {data.totals.memberCount}명 · 인정 {formatDuration(data.totals.recognizedSeconds * SECOND_MS)}
                </Text>
                <Text textStyle="t8Bold">
                  <SmoothCountUpNumber value={estimateTotal ?? 0} {...totalIntro} />원
                </Text>
                <Text textStyle="t4Regular" color="fg.neutralMuted">
                  기본급 {won(data.totals.basePayEstimate)} · 주휴·가산 {won(data.totals.allowanceEstimate)}
                </Text>
                <Text textStyle="t3Regular" color="fg.neutralMuted">
                  {PAYROLL_DISCLAIMER} {PREMIUM_NOT_APPLIED_NOTE[data.headcountBand] ?? ''}
                </Text>
              </section>
            </PageStaggerEntranceItem>
          </PageStaggerEntrance>
          <CardStaggerList
            className="store-list"
            items={data.members}
            getKey={(member) => member.memberId}
            renderItem={(member) => <MemberRow storeId={storeId} periodStart={data.period.start} member={member} />}
          />
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
    <AppLink className="store-list__item" href={`/owner/${storeId}/attendances?memberId=${member.memberId}&periodStart=${periodStart}`}>
      <div className="payroll-row">
        <Text textStyle="t5Bold">{member.name}</Text>
        <Text textStyle="t5Bold">{won(member.basePayEstimate + member.allowances.total)}</Text>
      </div>
      <Text textStyle="t4Regular" color="fg.neutralMuted">
        {member.recognizedSeconds === 0
          ? '이 기간에 끝난 근무가 없어요'
          : `${member.workDays}일 · ${formatDuration(member.recognizedSeconds * SECOND_MS)} · 시급 ${member.byWage
              .map((wage) => won(wage.hourlyWage))
              .join(' → ')}`}
      </Text>
      {member.allowances.total > 0 ? (
        <Text textStyle="t4Regular" color="fg.neutralMuted">
          기본급 {won(member.basePayEstimate)} · {formatAllowanceBreakdown(member.allowances)}
        </Text>
      ) : null}
      {flags.length > 0 ? (
        <div className="badges">
          {flags.map((flag) => (
            <span key={flag} className="badge">
              {flag}
            </span>
          ))}
        </div>
      ) : null}
    </AppLink>
  );
}
