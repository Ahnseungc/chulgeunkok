'use client';

import { ActionButton, Text } from '@seed-design/react';
import { useState } from 'react';

import { apiFetch } from '@/shared/lib/api-client';
import { errorMessageOf } from '@/shared/lib/useApiResource';
import Sheet from '@/shared/ui/Sheet';

interface QrRotateSheetProps {
  storeId: string;
  open: boolean;
  onClose: () => void;
  /** 새 QR 주소. 시트는 부르는 쪽이 닫는다 */
  onRotated: (url: string) => void;
}

/** 매장 QR 재발급 확인. 매장 설정과 QR 카드 화면이 같은 경고 문구를 쓴다 (docs/specs/store §5.2, qr-card §5.7) */
export default function QrRotateSheet({ storeId, open, onClose, onRotated }: QrRotateSheetProps) {
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const rotate = async () => {
    setPending(true);
    setErrorMessage(null);
    try {
      const { url } = await apiFetch<{ url: string }>(`/api/v1/stores/${storeId}/qr/rotate`, { method: 'POST', body: '{}' });
      onRotated(url);
    } catch (error) {
      setErrorMessage(errorMessageOf(error));
    } finally {
      setPending(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="새 QR을 만들까요?">
      <Text as="p" textStyle="t5Regular" color="fg.neutralMuted">
        지금 붙어 있는 QR과 NFC 스티커는 바로 쓸 수 없어요. 새 QR을 출력해 붙이고, NFC는 새 주소로 다시 써 주세요.
      </Text>
      {errorMessage ? (
        <Text as="p" textStyle="t4Regular" color="fg.critical" role="alert">
          {errorMessage}
        </Text>
      ) : null}
      <div className="sheet__actions">
        <ActionButton variant="neutralWeak" size="large" flexGrow onClick={onClose}>
          취소
        </ActionButton>
        <ActionButton variant="criticalSolid" size="large" flexGrow loading={pending} onClick={() => void rotate()}>
          새로 만들기
        </ActionButton>
      </div>
    </Sheet>
  );
}
