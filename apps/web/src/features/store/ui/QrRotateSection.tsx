'use client';

import { ActionButton, Text } from '@seed-design/react';
import { useState } from 'react';

import { AppLink } from '@/shared/ui/AppLink';

import QrRotateSheet from './QrRotateSheet';
import StoreQrCard from './StoreQrCard';

interface QrRotateSectionProps {
  storeId: string;
  storeName: string;
  qrIssuedAt: string | null;
}

/**
 * 매장 QR 재발급과 QR 카드 만들기 진입. 매장 설정은 Owner만 열린다 (docs/specs/store §5.2·§5.4, qr-card §5.1)
 */
export default function QrRotateSection({ storeId, storeName, qrIssuedAt }: QrRotateSectionProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [newUrl, setNewUrl] = useState<string | null>(null);

  const handleRotated = (url: string) => {
    setNewUrl(url);
    setConfirmOpen(false);
  };

  return (
    <section className="detail-section" aria-labelledby="qr-heading">
      <Text as="h2" id="qr-heading" textStyle="t6Bold">
        매장 QR
      </Text>
      {newUrl ? (
        // 시트가 내려간 뒤 새 QR이 제자리에서 나타난다 (등장 모션은 StoreQrCard 가 맡는다)
        <StoreQrCard storeId={storeId} storeName={storeName} url={newUrl} />
      ) : (
        <>
          <Text textStyle="t4Regular" color="fg.neutralMuted">
            {qrIssuedAt ? `${new Date(qrIssuedAt).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}에 만든 QR을 쓰고 있어요. ` : ''}
            QR을 잃어버렸거나 매장 밖으로 사진이 퍼졌다면 새로 만들어 주세요.
          </Text>
          <div className="store-qr__actions">
            <ActionButton asChild variant="neutralWeak" size="medium">
              <AppLink href={`/owner/${storeId}/qr-card`}>QR 카드 만들기</AppLink>
            </ActionButton>
            <ActionButton variant="neutralWeak" size="medium" onClick={() => setConfirmOpen(true)}>
              새 QR 만들기
            </ActionButton>
          </div>
        </>
      )}
      <QrRotateSheet storeId={storeId} open={confirmOpen} onClose={() => setConfirmOpen(false)} onRotated={handleRotated} />
    </section>
  );
}
