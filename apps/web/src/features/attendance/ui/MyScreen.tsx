'use client';

import { Text } from '@seed-design/react';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';

import type { MeDto } from '@/features/auth/model/me-types';
import { PAYROLL_DISCLAIMER } from '@/features/payroll/model/payroll-types';
import { formatClock, formatDuration, formatLocalDate } from '@/shared/lib/format-time';
import { useApiResource } from '@/shared/lib/useApiResource';
import PeriodNav from '@/shared/ui/PeriodNav';

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

  return (
    <main className="screen">
      <Image src="/brand/wordmark.png" alt="출근콕" width={104} height={40} priority />
      {me.errorMessage ? (
        <Text as="p" textStyle="t5Regular" color="fg.neutralMuted">
          {me.errorMessage}
        </Text>
      ) : null}
      {me.data ? (
        <Text as="h1" textStyle="t8Bold">
          {me.data.user.name}님의 근무
        </Text>
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
      {mine.errorMessage ? (
        <Text as="p" textStyle="t5Regular" color="fg.critical" role="alert">
          {mine.errorMessage}
        </Text>
      ) : null}

      {data ? (
        <>
          {data.working ? (
            <section className="dash-card" aria-label="지금 근무 중">
              <Text textStyle="t6Bold">{data.store.name}에서 근무 중</Text>
              <Text textStyle="t4Regular" color="fg.neutralMuted">
                {formatClock(data.working.clockInAt)} 출근 · 퇴근할 때 매장 QR을 다시 찍어 주세요
              </Text>
            </section>
          ) : null}
          <PeriodNav period={data.period} onChange={setPeriodStart} />
          <section className="dash-card" aria-label="이번 기간 합계">
            <Text textStyle="t4Regular" color="fg.neutralMuted">
              {data.summary.workDays}일 · 인정 {formatDuration(data.summary.recognizedSeconds * SECOND_MS)}
            </Text>
            <Text textStyle="t8Bold">예상 {data.summary.basePayEstimate.toLocaleString('ko-KR')}원</Text>
            <Text textStyle="t3Regular" color="fg.neutralMuted">
              {PAYROLL_DISCLAIMER} 실제 급여는 사장님이 정해요.
            </Text>
          </section>
          {data.rows.length === 0 ? (
            <Text as="p" textStyle="t5Regular" color="fg.neutralMuted">
              이 기간에는 기록이 없어요
            </Text>
          ) : null}
          <ul className="store-list">
            {data.rows.map((row) => (
              <li key={row.id}>
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
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </main>
  );
}
