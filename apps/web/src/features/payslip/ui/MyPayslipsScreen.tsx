'use client';

import { ActionButton, Text } from '@seed-design/react';
import Link from 'next/link';
import { useState } from 'react';

import { formatWon as won } from '@/features/payroll/model/payroll-types';
import { formatPeriodRange } from '@/shared/lib/format-time';
import { CardStaggerList } from '@/shared/motion/CardStaggerList';
import InlineAlert from '@/shared/ui/InlineAlert';
import ScreenHeader from '@/shared/ui/ScreenHeader';

import type { MyPayslipListItemDto } from '../model/payslip-types';

import { useMyPayslips } from './useMyPayslips';

interface MyPayslipsScreenProps {
  storeId?: string;
}

/** `/me/payslips` — docs/specs/payslip §5.3. SUPERSEDED 는 "이전 버전"으로 접는다 */
export default function MyPayslipsScreen({ storeId }: MyPayslipsScreenProps) {
  const { items, errorMessage } = useMyPayslips(storeId);
  const [showOld, setShowOld] = useState(false);
  const current = items?.filter((item) => item.status === 'SENT') ?? [];
  const old = items?.filter((item) => item.status === 'SUPERSEDED') ?? [];

  return (
    <main className="screen">
      <ScreenHeader backHref="/me" backLabel="내 근무" title="임금명세서" />
      <Text as="h1" textStyle="t8Bold">
        임금명세서
      </Text>
      <InlineAlert message={errorMessage} />
      {items && current.length === 0 ? (
        <Text as="p" textStyle="t5Regular" color="fg.neutralMuted">
          아직 받은 명세서가 없어요
        </Text>
      ) : null}
      <CardStaggerList className="store-list" items={current} getKey={(item) => item.payslipId} renderItem={(item) => <PayslipCard item={item} />} />
      {old.length > 0 ? (
        <>
          <ActionButton variant="neutralWeak" size="medium" aria-expanded={showOld} onClick={() => setShowOld((open) => !open)}>
            이전 버전 {old.length}개 {showOld ? '접기' : '보기'}
          </ActionButton>
          {showOld ? (
            <CardStaggerList className="store-list" items={old} getKey={(item) => item.payslipId} renderItem={(item) => <PayslipCard item={item} />} />
          ) : null}
        </>
      ) : null}
    </main>
  );
}

function PayslipCard({ item }: { item: MyPayslipListItemDto }) {
  return (
    <Link className="store-list__item" href={`/me/payslips/${item.payslipId}`}>
      <Text textStyle="t5Bold">{formatPeriodRange(item.periodStart, item.periodEnd)}</Text>
      <Text textStyle="t4Regular">실지급 {won(item.netPay)}</Text>
      <div className="badges">
        {item.status === 'SUPERSEDED' ? <span className="badge">이전 버전</span> : null}
        {item.status === 'SENT' && !item.viewed ? <span className="badge badge--positive">새 명세서</span> : null}
        {item.status === 'SENT' && item.isCorrection ? <span className="badge badge--warning">정정</span> : null}
      </div>
    </Link>
  );
}
