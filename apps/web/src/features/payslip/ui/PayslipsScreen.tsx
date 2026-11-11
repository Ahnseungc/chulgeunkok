'use client';

import { ActionButton, Text } from '@seed-design/react';
import { useState } from 'react';

import { formatWon as won } from '@/features/payroll/model/payroll-types';
import { CardStaggerList } from '@/shared/motion/CardStaggerList';
import { AppLink } from '@/shared/ui/AppLink';
import InlineAlert from '@/shared/ui/InlineAlert';
import PeriodNav from '@/shared/ui/PeriodNav';
import ScreenHeader from '@/shared/ui/ScreenHeader';
import Sheet from '@/shared/ui/Sheet';

import type { PayslipListItemDto } from '../model/payslip-types';

import { payslipChipOf, UNRESOLVED_WARNING, unresolvedLabelOf } from './payslip-labels';
import { bulkSendTargetOf, usePayslips } from './usePayslips';

interface PayslipsScreenProps {
  storeId: string;
  /** URL `?periodStart=`. 없으면 끝난 최근 기간 (§5.1) */
  initialPeriodStart?: string;
}

/** `/owner/[storeId]/payslips` — docs/specs/payslip §5.1 */
export default function PayslipsScreen({ storeId, initialPeriodStart }: PayslipsScreenProps) {
  const payslips = usePayslips(storeId, initialPeriodStart);
  const { data } = payslips;
  const [confirmOpen, setConfirmOpen] = useState(false);
  const target = bulkSendTargetOf(data?.items ?? []);

  const handleSendAll = async () => {
    await payslips.sendAll(target.payslipIds);
    setConfirmOpen(false);
  };

  return (
    <main className="screen">
      <ScreenHeader backHref={`/owner/${storeId}`} backLabel="매장 홈" title="임금명세서" />
      <Text as="h1" textStyle="t8Bold">
        임금명세서
      </Text>
      <InlineAlert message={payslips.errorMessage} />
      <PeriodNav period={data?.period ?? null} onChange={payslips.setPeriodStart} />
      {data ? (
        <>
          <Text as="p" textStyle="t5Regular" color="fg.neutralMuted">
            확인 필요 {data.counts.draft} · 보냄 {data.counts.sent} · 정정 필요 {data.counts.correction}
          </Text>
          {data.items.length === 0 ? (
            <Text as="p" textStyle="t5Regular" color="fg.neutralMuted">
              이 기간 명세서가 없어요. 정산 기간이 끝나면 근무한 직원마다 초안이 생겨요.
            </Text>
          ) : (
            <CardStaggerList
              className="store-list"
              items={data.items}
              getKey={(item) => item.payslipId}
              renderItem={(item) => <PayslipRow storeId={storeId} item={item} />}
            />
          )}
        </>
      ) : null}
      <InlineAlert
        message={payslips.message?.text}
        textStyle="t4Regular"
        color={payslips.message?.error ? 'fg.critical' : 'fg.positive'}
        role={payslips.message?.error ? 'alert' : 'status'}
      />
      <div className="punch-bottom">
        <ActionButton
          variant="neutralSolid"
          size="large"
          flexGrow
          loading={!data}
          disabled={target.payslipIds.length === 0}
          onClick={() => setConfirmOpen(true)}
        >
          확인 필요 모두 보내기
        </ActionButton>
      </div>
      <Sheet open={confirmOpen} onClose={() => setConfirmOpen(false)} title="확인 필요 명세서를 보낼까요?">
        <Text as="p" textStyle="t5Bold">
          {target.payslipIds.length}명 · 실지급 합계 {won(target.netPayTotal)}
        </Text>
        <Text as="p" textStyle="t4Regular" color={target.missingPayDate > 0 ? 'fg.critical' : 'fg.neutralMuted'}>
          {target.missingPayDate > 0
            ? `지급일이 없는 명세서가 ${target.missingPayDate}건 있어요. 매장 설정에서 급여 지급일을 정하거나 명세서마다 넣어 주세요.`
            : '보내면 직원 앱에 알림이 가요. 보낸 명세서는 고칠 수 없어요.'}
        </Text>
        {target.unresolved > 0 ? (
          <Text as="p" textStyle="t4Regular" color="fg.warning" role="note">
            {target.unresolved}명에게 {UNRESOLVED_WARNING}
          </Text>
        ) : null}
        <div className="sheet__actions">
          <ActionButton variant="neutralWeak" size="large" flexGrow onClick={() => setConfirmOpen(false)}>
            취소
          </ActionButton>
          <ActionButton
            variant="neutralSolid"
            size="large"
            flexGrow
            loading={payslips.pending}
            disabled={target.missingPayDate > 0}
            onClick={() => void handleSendAll()}
          >
            보내기
          </ActionButton>
        </div>
      </Sheet>
    </main>
  );
}

function PayslipRow({ storeId, item }: { storeId: string; item: PayslipListItemDto }) {
  const chip = payslipChipOf(item);
  const unresolved = item.status === 'DRAFT' ? unresolvedLabelOf(item.unresolvedCount) : null;
  return (
    <AppLink className="store-list__item" href={`/owner/${storeId}/payslips/${item.payslipId}`}>
      <div className="payroll-row">
        <Text textStyle="t5Bold">{item.name}</Text>
        <Text textStyle="t5Bold">{won(item.netPay)}</Text>
      </div>
      <div className="badges">
        <span className={chip.className}>{chip.label}</span>
        {unresolved ? <span className="badge badge--critical">{unresolved}</span> : null}
        {item.status !== 'DRAFT' && item.viewed ? <span className="badge">읽음</span> : null}
        {item.pushEnabled ? null : <span className="badge">알림 미수신</span>}
      </div>
    </AppLink>
  );
}
