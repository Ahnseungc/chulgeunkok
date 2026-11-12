'use client';

import { ActionButton, Text } from '@seed-design/react';
import { useState } from 'react';

import { SuccessEntrance, SuccessEntranceItem, SuccessEntranceMark } from '@/shared/motion/SuccessEntrance';
import { AppLink } from '@/shared/ui/AppLink';
import KokMark from '@/shared/ui/KokMark';
import QrImage from '@/shared/ui/QrImage';

interface StoreQrCardProps {
  storeId: string;
  storeName: string;
  url: string;
}

/** 매장 생성·QR 재발급 직후의 출근 QR. 인쇄·저장하거나 QR 카드 화면으로 간다 (docs/specs/store §5.3·§5.4) */
export default function StoreQrCard({ storeId, storeName, url }: StoreQrCardProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  return (
    <section className="punch-center" aria-live="polite">
      {/* 매장을 만든 직후·QR 재발급 직후 한 번 */}
      <SuccessEntrance>
        <SuccessEntranceMark>
          <KokMark size={64} />
        </SuccessEntranceMark>
        <SuccessEntranceItem>
          <Text as="h1" textStyle="t8Bold">
            {storeName} 준비 완료
          </Text>
        </SuccessEntranceItem>
        <SuccessEntranceItem>
          <Text as="p" textStyle="t5Regular" color="fg.neutralMuted">
            QR을 출력해 매장에 붙여 주세요
          </Text>
        </SuccessEntranceItem>
        <SuccessEntranceItem>
          <Text as="p" textStyle="t5Regular" color="fg.neutralMuted">
            직원이 찍으면 바로 출퇴근돼요
          </Text>
        </SuccessEntranceItem>
        <SuccessEntranceItem className="store-qr">
          <QrImage value={url} alt={`${storeName} 출근 QR`} onReady={setDataUrl} />
        </SuccessEntranceItem>
        <SuccessEntranceItem className="store-qr__actions">
          <ActionButton variant="neutralWeak" size="medium" onClick={() => window.print()}>
            인쇄하기
          </ActionButton>
          {dataUrl ? (
            <ActionButton asChild variant="neutralWeak" size="medium">
              <a href={dataUrl} download={`${storeName}-출근QR.png`}>
                이미지 저장
              </a>
            </ActionButton>
          ) : null}
          {/* 스탠드·스티커 카드는 QR 카드 화면에서 만든다 (docs/specs/store §5.4, qr-card §5.1) */}
          <ActionButton asChild variant="neutralWeak" size="medium">
            <AppLink href={`/owner/${storeId}/qr-card`}>QR 카드 만들기</AppLink>
          </ActionButton>
        </SuccessEntranceItem>
      </SuccessEntrance>
    </section>
  );
}
