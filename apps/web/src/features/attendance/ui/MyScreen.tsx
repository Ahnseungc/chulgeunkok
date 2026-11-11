'use client';

import { ActionButton, Text } from '@seed-design/react';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';

import type { MeDto } from '@/features/auth/model/me-types';
import { PAYROLL_DISCLAIMER, formatAllowanceBreakdown, formatWon } from '@/features/payroll/model/payroll-types';
import { postToApp, useIsInApp } from '@/shared/lib/app-shell';
import { formatClock, formatDuration, formatLocalDate, formatPeriodRange } from '@/shared/lib/format-time';
import { useApiResource } from '@/shared/lib/useApiResource';
import { CardStaggerList } from '@/shared/motion/CardStaggerList';
import { PageStaggerEntrance, PageStaggerEntranceItem } from '@/shared/motion/PageStaggerEntrance';
import { SmoothCountUpNumber } from '@/shared/motion/SmoothCountUpNumber';
import { useIntroCountUp } from '@/shared/motion/useIntroCountUp';
import InlineAlert from '@/shared/ui/InlineAlert';
import PeriodNav from '@/shared/ui/PeriodNav';
import { TEXT_PLACEHOLDER } from '@/shared/ui/text-placeholder';

import type { MyPayslipListItemDto } from '@/features/payslip/model/payslip-types';

import type { MyAttendancesDto } from '../model/my-attendance-types';

import { AttendanceBadges } from './AttendancesScreen';
import { CORRECTION_TYPE_LABEL } from './correction-labels';

const SECOND_MS = 1000;
/** 직원 화면은 로그인 화면이 없다. 미등록이면 안내 문구만 (docs/specs/auth §1) */
const EMPLOYEE_OPTIONS = { loginPath: null } as const;

/** `/me` 직원 본인 기록 — docs/specs/attendance §8 */
export default function MyScreen() {
  const me = useApiResource<MeDto>('/api/v1/me', EMPLOYEE_OPTIONS);
  const stores = me.data?.memberships.filter((membership) => membership.status === 'ACTIVE') ?? [];
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const storeId = selectedStoreId ?? stores[0]?.storeId ?? null;
  const [periodStart, setPeriodStart] = useState<string | undefined>();
  const query = storeId ? new URLSearchParams({ storeId, ...(periodStart ? { periodStart } : {}) }) : null;
  const mine = useApiResource<MyAttendancesDto>(query ? `/api/v1/attendance/me?${query}` : null, EMPLOYEE_OPTIONS);
  const data = mine.data;
  // 퇴사자(INACTIVE)도 자기 명세서는 본다 (docs/specs/payslip §1-6)
  const payslipStoreId = storeId ?? me.data?.memberships[0]?.storeId ?? null;
  const payslips = useApiResource<{ items: MyPayslipListItemDto[] }>(
    payslipStoreId ? `/api/v1/attendance/me/payslips?storeId=${payslipStoreId}` : null,
    EMPLOYEE_OPTIONS,
  );
  const latestPayslip = payslips.data?.items.find((payslip) => payslip.status === 'SENT');
  const inApp = useIsInApp();
  // 처음 받은 예상 금액만 카운트업. 기간을 옮겨 바뀐 값은 바로 바꾼다
  const estimateTotal = data ? data.summary.basePayEstimate + data.summary.allowances.total : undefined;
  const estimateIntro = useIntroCountUp(estimateTotal);

  return (
    <main className="screen">
      <Image src="/brand/wordmark.png" alt="출근콕" width={104} height={40} priority />
      {/* 제목 줄은 먼저 잡아, 이름이 와도 아래 QR 버튼이 밀리지 않게 한다 */}
      <Text as="h1" textStyle="t8Bold">
        {me.data ? `${me.data.user.name}님의 근무` : TEXT_PLACEHOLDER}
      </Text>
      {me.errorMessage ? (
        <Text as="p" textStyle="t5Regular" color="fg.neutralMuted">
          {me.errorMessage}
        </Text>
      ) : null}
      {/* 앱 안에서는 카메라를 바로 연다. 브라우저에서는 휴대폰 기본 카메라로 매장 QR을 찍는다 */}
      {inApp ? (
        <ActionButton variant="neutralSolid" size="large" onClick={() => postToApp({ type: 'OPEN_SCANNER' })}>
          매장 QR 찍기
        </ActionButton>
      ) : null}
      {stores.length > 1 ? (
        <select className="native-select" aria-label="매장" value={storeId ?? ''} onChange={(event) => setSelectedStoreId(event.target.value)}>
          {stores.map((store) => (
            <option key={store.storeId} value={store.storeId}>
              {store.storeName}
            </option>
          ))}
        </select>
      ) : null}
      {me.data && stores.length === 0 ? (
        <Text as="p" textStyle="t5Regular" color="fg.neutralMuted">
          아직 소속된 매장이 없어요. 사장님께 직원 등록 QR을 보여 달라고 해 주세요.
        </Text>
      ) : null}
      <InlineAlert message={mine.errorMessage} />
      {/* 명세서 조회 실패는 홈 기록을 가리지 않게 카드만 숨긴다 */}
      {latestPayslip && payslipStoreId ? (
        <Link className="dash-card" href={`/me/payslips?storeId=${payslipStoreId}`} aria-label="최신 임금명세서 보기">
          <Text textStyle="t5Bold">{latestPayslip.viewed ? '임금명세서' : '새 임금명세서가 도착했어요'}</Text>
          <Text textStyle="t4Regular" color="fg.neutralMuted">
            {formatPeriodRange(latestPayslip.periodStart, latestPayslip.periodEnd)} · 실지급 {formatWon(latestPayslip.netPay)}
          </Text>
        </Link>
      ) : null}

      {/* 첫 조회 때만 내려온다. 기간·매장을 바꿔도 다시 마운트되지 않아 재생하지 않는다 */}
      {data ? (
        <>
          <PageStaggerEntrance className="motion-contents">
            {data.working ? (
              <PageStaggerEntranceItem>
                <section className="dash-card" aria-label="지금 근무 중">
                  <Text textStyle="t6Bold">{data.store.name}에서 근무 중</Text>
                  <Text textStyle="t4Regular" color="fg.neutralMuted">
                    {formatClock(data.working.clockInAt)} 출근 · 퇴근할 때 매장 QR을 다시 찍어 주세요
                  </Text>
                </section>
              </PageStaggerEntranceItem>
            ) : null}
            <PageStaggerEntranceItem>
              <PeriodNav period={data.period} onChange={setPeriodStart} />
            </PageStaggerEntranceItem>
            <PageStaggerEntranceItem>
              <section className="dash-card" aria-label="이번 기간 합계">
                <Text textStyle="t4Regular" color="fg.neutralMuted">
                  {data.summary.workDays}일 · 인정 {formatDuration(data.summary.recognizedSeconds * SECOND_MS)}
                </Text>
                <Text textStyle="t8Bold">
                  예상 <SmoothCountUpNumber value={estimateTotal ?? 0} {...estimateIntro} />원
                </Text>
                {data.summary.allowances.total > 0 ? (
                  <Text textStyle="t4Regular" color="fg.neutralMuted">
                    기본급 {formatWon(data.summary.basePayEstimate)} · {formatAllowanceBreakdown(data.summary.allowances)}
                  </Text>
                ) : null}
                <Text textStyle="t3Regular" color="fg.neutralMuted">
                  {PAYROLL_DISCLAIMER} 실제 급여는 사장님이 정해요.
                </Text>
              </section>
            </PageStaggerEntranceItem>
          </PageStaggerEntrance>
          {data.rows.length === 0 ? (
            <Text as="p" textStyle="t5Regular" color="fg.neutralMuted">
              이 기간에는 기록이 없어요
            </Text>
          ) : null}
          <CardStaggerList
            className="store-list"
            items={data.rows}
            getKey={(row) => row.id}
            renderItem={(row) => (
              <Link className="store-list__item" href={`/me/attendances/${row.id}`}>
                <Text textStyle="t5Bold">{formatLocalDate(row.localDate)}</Text>
                <Text textStyle="t4Regular">
                  {formatClock(row.clockInAt)} ~ {row.clockOutAt ? formatClock(row.clockOutAt) : ''}
                  {row.status === 'CLOSED' ? ` · ${formatDuration(row.recognizedSeconds * SECOND_MS)}` : ''}
                </Text>
                <AttendanceBadges row={row} />
                {row.pendingCorrection ? (
                  <span className="badge badge--warning">{CORRECTION_TYPE_LABEL[row.pendingCorrection]} 확인 중</span>
                ) : null}
              </Link>
            )}
          />
        </>
      ) : null}
    </main>
  );
}
