'use client';

import { ActionButton, Text } from '@seed-design/react';
import { useState } from 'react';

import { apiFetch } from '@/shared/lib/api-client';
import { errorMessageOf } from '@/shared/lib/useApiResource';
import Sheet from '@/shared/ui/Sheet';

import StoreQrCard from './StoreQrCard';

interface QrRotateSectionProps {
  storeId: string;
  storeName: string;
  qrIssuedAt: string | null;
}

/**
 * 매장 QR 재발급. QR 원문은 저장하지 않아 다시 볼 수 없으므로, 잃어버렸으면 새로 만든다 (docs/specs/store §5.2·§5.3)
 */
export default function QrRotateSection({ storeId, storeName, qrIssuedAt }: QrRotateSectionProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [newUrl, setNewUrl] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const rotate = async () => {
    setPending(true);
    setErrorMessage(null);
    try {
      const { url } = await apiFetch<{ url: string }>(`/api/v1/stores/${storeId}/qr/rotate`, { method: 'POST', body: '{}' });
      setNewUrl(url);
      setConfirmOpen(false);
    } catch (error) {
      setErrorMessage(errorMessageOf(error));
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="detail-section" aria-labelledby="qr-heading">
      <Text as="h2" id="qr-heading" textStyle="t6Bold">
        매장 QR
      </Text>
      {newUrl ? (
        // 시트가 내려간 뒤 새 QR이 제자리에서 나타난다 (등장 모션은 StoreQrCard 가 맡는다)
        <StoreQrCard storeName={storeName} url={newUrl} />
      ) : (
        <>
          <Text textStyle="t4Regular" color="fg.neutralMuted">
            {qrIssuedAt ? `${new Date(qrIssuedAt).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}에 만든 QR을 쓰고 있어요. ` : ''}
            QR을 잃어버렸거나 매장 밖으로 사진이 퍼졌다면 새로 만들어 주세요.
          </Text>
          <ActionButton variant="neutralWeak" size="medium" onClick={() => setConfirmOpen(true)}>
            새 QR 만들기
          </ActionButton>
        </>
      )}
      <Sheet open={confirmOpen} onClose={() => setConfirmOpen(false)} title="새 QR을 만들까요?">
        <Text as="p" textStyle="t5Regular" color="fg.neutralMuted">
          지금 붙어 있는 QR과 NFC 스티커는 바로 쓸 수 없어요. 새 QR을 출력해 붙이고, NFC는 새 주소로 다시 써 주세요.
        </Text>
        {errorMessage ? (
          <Text as="p" textStyle="t4Regular" color="fg.critical" role="alert">
            {errorMessage}
          </Text>
        ) : null}
        <div className="sheet__actions">
          <ActionButton variant="neutralWeak" size="large" flexGrow onClick={() => setConfirmOpen(false)}>
            취소
          </ActionButton>
          <ActionButton variant="criticalSolid" size="large" flexGrow loading={pending} onClick={() => void rotate()}>
            새로 만들기
          </ActionButton>
        </div>
      </Sheet>
    </section>
  );
}
