'use client';

import QRCode from 'qrcode';
import { useEffect, useRef, useState } from 'react';

const DEFAULT_SIZE = 240;

interface QrImageProps {
  value: string;
  alt: string;
  size?: number;
  /** 저장 버튼 등에서 이미지 data URL이 필요할 때 */
  onReady?: (dataUrl: string) => void;
}

/** 클라이언트에서 그리는 QR. 토큰 원문이 서버 밖으로 다시 나가지 않는다 */
export default function QrImage({ value, alt, size = DEFAULT_SIZE, onReady }: QrImageProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  // 호출부가 인라인 함수를 넘겨도 QR을 다시 그리지 않도록 최신 콜백만 참조한다
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(value, { width: size * 2, margin: 1 })
      .then((url) => {
        if (cancelled) return;
        setDataUrl(url);
        onReadyRef.current?.(url);
      })
      .catch(() => setDataUrl(null));
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  if (!dataUrl) return <div className="qr-image" style={{ width: size, height: size }} aria-hidden="true" />;
  // data URL이라 next/image 최적화 대상이 아니다
  return <img className="qr-image" src={dataUrl} width={size} height={size} alt={alt} />;
}
