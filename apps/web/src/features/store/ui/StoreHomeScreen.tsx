'use client';

import { Text } from '@seed-design/react';
import Link from 'next/link';

import { useApiResource } from '@/shared/lib/useApiResource';

interface StoreSummary {
  id: string;
  name: string;
  myRole: 'OWNER' | 'MANAGER' | 'EMPLOYEE';
}

interface StoreHomeScreenProps {
  storeId: string;
}

const MENU = [
  { path: 'members', title: '직원', description: '직원 등록, 근로조건, 안내 확인', ready: true },
  { path: 'attendances', title: '근태 기록', description: '출퇴근 기록과 수정 요청', ready: false },
  { path: 'payroll', title: '정산', description: '근무시간과 예상 기본급, CSV', ready: false },
  { path: 'settings', title: '매장 설정', description: 'QR 재발급, 사업장 규모', ready: false },
] as const;

/**
 * `/owner/[storeId]` 매장 홈.
 * ponytail: 대시보드(docs/specs/dashboard)를 만들기 전까지 메뉴만 둔다.
 */
export default function StoreHomeScreen({ storeId }: StoreHomeScreenProps) {
  const { data: store, errorMessage } = useApiResource<StoreSummary>(`/api/v1/stores/${storeId}`);

  return (
    <main className="screen">
      <Link href="/owner" className="back-link">
        ← 내 매장
      </Link>
      <Text as="h1" textStyle="t8Bold">
        {store?.name ?? ' '}
      </Text>
      {errorMessage ? (
        <Text as="p" textStyle="t5Regular" color="fg.critical" role="alert">
          {errorMessage}
        </Text>
      ) : null}
      <ul className="store-list">
        {MENU.map((item) => (
          <li key={item.path}>
            {item.ready ? (
              <Link className="store-list__item" href={`/owner/${storeId}/${item.path}`}>
                <Text textStyle="t5Bold">{item.title}</Text>
                <Text textStyle="t4Regular" color="fg.neutralMuted">
                  {item.description}
                </Text>
              </Link>
            ) : (
              <div className="store-list__item store-list__item--disabled" aria-disabled="true">
                <Text textStyle="t5Bold">{item.title}</Text>
                <Text textStyle="t4Regular" color="fg.neutralMuted">
                  준비 중이에요
                </Text>
              </div>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
