'use client';

import { ActionButton, Text } from '@seed-design/react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import type { MeDto } from '@/features/auth/model/me-types';
import { apiFetch, ApiRequestError } from '@/shared/lib/api-client';
import { CardStaggerList } from '@/shared/motion/CardStaggerList';
import InlineAlert from '@/shared/ui/InlineAlert';

const ROLE_LABEL = {
  OWNER: '사장님',
  MANAGER: '매니저',
  EMPLOYEE: '직원',
} as const satisfies Record<MeDto['memberships'][number]['role'], string>;

/** `/owner` — 내 매장 목록. 세션이 없으면 휴대폰 인증으로 보낸다 */
export default function MyStoresScreen() {
  const router = useRouter();
  const [me, setMe] = useState<MeDto | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<MeDto>('/api/v1/me')
      .then(setMe)
      .catch((error: unknown) => {
        if (error instanceof ApiRequestError && error.code === 'UNAUTHENTICATED') {
          router.replace('/owner/login');
          return;
        }
        setErrorMessage(error instanceof ApiRequestError ? error.message : '연결이 불안정해요.');
      });
  }, [router]);

  const stores = me?.memberships.filter((membership) => membership.status === 'ACTIVE') ?? [];

  return (
    <main className="screen">
      <Image src="/brand/wordmark.png" alt="출근콕" width={104} height={40} priority />
      <Text as="h1" textStyle="t8Bold">
        {me?.user.name ? `${me.user.name}님의 매장` : '내 매장'}
      </Text>
      <InlineAlert message={errorMessage} />
      {me && stores.length === 0 ? (
        <Text as="p" textStyle="t5Regular" color="fg.neutralMuted">
          아직 등록한 매장이 없어요. 가게를 검색해서 1분 만에 만들 수 있어요.
        </Text>
      ) : null}
      <CardStaggerList
        className="store-list"
        items={stores}
        getKey={(store) => store.storeId}
        renderItem={(store) => (
          <Link className="store-list__item" href={`/owner/${store.storeId}`}>
            <Text textStyle="t5Bold">{store.storeName}</Text>
            <Text textStyle="t4Regular" color="fg.neutralMuted">
              {ROLE_LABEL[store.role]}
            </Text>
          </Link>
        )}
      />
      {me ? (
        <div className="punch-bottom">
          <ActionButton asChild variant="neutralSolid" size="large" flexGrow>
            <Link href="/owner/stores/new">매장 만들기</Link>
          </ActionButton>
        </div>
      ) : null}
    </main>
  );
}
