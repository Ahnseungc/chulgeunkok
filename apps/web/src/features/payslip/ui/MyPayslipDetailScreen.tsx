'use client';

import { Text } from '@seed-design/react';
import { useEffect, useRef } from 'react';

import { apiFetch } from '@/shared/lib/api-client';
import { formatPeriodRange } from '@/shared/lib/format-time';
import { useApiResource } from '@/shared/lib/useApiResource';
import { PageStaggerEntrance, PageStaggerEntranceItem } from '@/shared/motion/PageStaggerEntrance';
import InlineAlert from '@/shared/ui/InlineAlert';
import ScreenHeader from '@/shared/ui/ScreenHeader';
import { TEXT_PLACEHOLDER } from '@/shared/ui/text-placeholder';

import type { PayslipDetailDto } from '../model/payslip-types';

import { WorkSummary } from './PayslipDetailScreen';
import PayslipTable from './PayslipTable';

interface MyPayslipDetailScreenProps {
  payslipId: string;
}

/** `/me/payslips/[payslipId]` — docs/specs/payslip §5.3. 처음 열면 열람 기록을 한 번 남긴다 */
export default function MyPayslipDetailScreen({ payslipId }: MyPayslipDetailScreenProps) {
  const { data: payslip, errorMessage } = useApiResource<PayslipDetailDto>(`/api/v1/payslips/${payslipId}`, { loginPath: null });
  const viewSent = useRef(false);

  useEffect(() => {
    if (!payslip || viewSent.current) return;
    viewSent.current = true;
    // 열람 기록 실패는 명세서를 보는 데 영향이 없다. 다음에 열 때 다시 남긴다
    void apiFetch(`/api/v1/payslips/${payslipId}/view`, { method: 'POST' }).catch(() => undefined);
  }, [payslip, payslipId]);

  const isCorrection = (payslip?.version ?? 1) > 1;

  return (
    <main className="screen">
      <ScreenHeader backHref="/me/payslips" backLabel="임금명세서" title={payslip ? formatPeriodRange(payslip.periodStart, payslip.periodEnd) : undefined} />
      <header className="member-header">
        <Text as="h1" textStyle="t8Bold">
          {payslip ? formatPeriodRange(payslip.periodStart, payslip.periodEnd) : TEXT_PLACEHOLDER}
        </Text>
        {payslip?.status === 'SUPERSEDED' ? (
          <Text textStyle="t4Regular" color="fg.neutralMuted">
            이전 버전이에요. 정정본이 더 최신이에요.
          </Text>
        ) : null}
        {isCorrection && payslip?.correctionNote ? (
          <Text textStyle="t5Bold" role="note">
            정정 사유: {payslip.correctionNote}
          </Text>
        ) : null}
      </header>
      <InlineAlert message={errorMessage} />
      {payslip ? (
        <PageStaggerEntrance className="motion-contents">
          <PageStaggerEntranceItem>
            <WorkSummary payslip={payslip} />
          </PageStaggerEntranceItem>
          <PageStaggerEntranceItem>
            <PayslipTable payslip={payslip} />
          </PageStaggerEntranceItem>
        </PageStaggerEntrance>
      ) : null}
    </main>
  );
}
