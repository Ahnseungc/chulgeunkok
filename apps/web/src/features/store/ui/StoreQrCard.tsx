'use client';

import { ActionButton, Text } from '@seed-design/react';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';

import KokMark from '@/shared/ui/KokMark';

const QR_IMAGE_SIZE = 240;

interface StoreQrCardProps {
  storeName: string;
  url: string;
}

/** 매장 출근 QR. 원문 URL은 생성 직후에만 있으므로 이 화면에서 인쇄·저장한다 (docs/specs/store §5.3) */
export default function StoreQrCard({ storeName, url }: StoreQrCardProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    QRCode.toDataURL(url, { width: QR_IMAGE_SIZE * 2, margin: 1 })
      .then(setDataUrl)
      .catch(() => setDataUrl(null));
  }, [url]);

  return (
    <section className="punch-center" aria-live="polite">
      <KokMark size={64} />
      <Text as="h1" textStyle="t8Bold">
        {storeName} 준비 완료
      </Text>
      <Text as="p" textStyle="t5Regular" color="fg.neutralMuted">
        QR을 출력해 매장에 붙여 주세요
      </Text>
      <Text as="p" textStyle="t5Regular" color="fg.neutralMuted">
        직원이 찍으면 바로 출퇴근돼요
      </Text>
      {dataUrl ? (
        // QR은 data URL이라 next/image 최적화 대상이 아니다
        <img className="store-qr" src={dataUrl} width={QR_IMAGE_SIZE} height={QR_IMAGE_SIZE} alt={`${storeName} 출근 QR`} />
      ) : null}
      <div className="store-qr__actions">
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
      </div>
    </section>
  );
}
