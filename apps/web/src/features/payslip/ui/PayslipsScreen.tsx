'use client';

import { ActionButton, Snackbar, Text } from '@seed-design/react';
import { useState } from 'react';

import { PHONE_VERIFICATION_REQUIRED } from '@/features/auth/model/after-login';
import PhoneVerificationPrompt from '@/features/auth/ui/PhoneVerificationPrompt';
import { formatWon as won } from '@/features/payroll/model/payroll-types';
import { CardStaggerList } from '@/shared/motion/CardStaggerList';
import { AppLink } from '@/shared/ui/AppLink';
import InlineAlert from '@/shared/ui/InlineAlert';
import PeriodNav from '@/shared/ui/PeriodNav';
import ScreenHeader from '@/shared/ui/ScreenHeader';
import Sheet from '@/shared/ui/Sheet';
import { useToast } from '@/shared/ui/useToast';

import type { PayslipListItemDto } from '../model/payslip-types';

import { payslipChipOf, SEND_BLOCK_MESSAGE, UNRESOLVED_WARNING, unresolvedLabelOf } from './payslip-labels';
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
  const toast = useToast();

  /** 지급일 없는 대상이 있으면 시트를 열지 않는다. 어느 명세서인지는 목록에서 고른다 */
  const handleSendAllTap = () => {
    if (target.missingPayDate > 0) {
      toast.error(SEND_BLOCK_MESSAGE.bulkPayDateMissing);
      return;
    }
    setConfirmOpen(true);
  };
  // 결과는 시트를 닫은 뒤 토스트로 (열린 <dialog> 위에는 토스트가 가려진다)
  const handleSendAll = async () => {
    const result = await payslips.sendAll(target.payslipIds);
    setConfirmOpen(false);
    if (result.ok) toast.success(`${result.sent}명에게 보냈어요`);
    else toast.error(result.message);
  };

  return (
    <main className="screen">
      <ScreenHeader backHref={`/owner/${storeId}`} backLabel="매장 홈" title="임금명세서" />
      <Text as="h1" textStyle="t8Bold">
        임금명세서
      </Text>
      {/* 급여 권한 Manager가 휴대폰 인증 전이면 인증으로 안내한다 (docs/specs/auth §4.2) */}
      {payslips.errorCode === PHONE_VERIFICATION_REQUIRED ? (
        <PhoneVerificationPrompt message={payslips.errorMessage} />
      ) : (
        <InlineAlert message={payslips.errorMessage} />
      )}
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
      <Snackbar.AvoidOverlap>
        <div className="punch-bottom">
          <ActionButton
            variant="neutralSolid"
            size="large"
            flexGrow
            loading={!data}
            disabled={target.payslipIds.length === 0}
            onClick={handleSendAllTap}
          >
            확인 필요 모두 보내기
          </ActionButton>
        </div>
      </Snackbar.AvoidOverlap>
      <Sheet open={confirmOpen} onClose={() => setConfirmOpen(false)} title="확인 필요 명세서를 보낼까요?">
        <Text as="p" textStyle="t5Bold">
          {target.payslipIds.length}명 · 실지급 합계 {won(target.netPayTotal)}
        </Text>
        <Text as="p" textStyle="t4Regular" color="fg.neutralMuted">
          보내면 직원 앱에 알림이 가요. 보낸 명세서는 고칠 수 없어요.
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
