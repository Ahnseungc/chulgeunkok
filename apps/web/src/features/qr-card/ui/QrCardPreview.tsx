'use client';

import { useEffect, useRef, useState } from 'react';

import InlineAlert from '@/shared/ui/InlineAlert';

import type { QrCardDesignDto } from '../model/qr-card-types';

import { renderQrCard } from './render-qr-card';

/** globals.css `.qr-card-preview` 의 최대 CSS 폭 */
const PREVIEW_MAX_CSS_PX = 320;
/** 고해상도 화면에서도 미리보기는 3배까지만 그린다 */
const MAX_PIXEL_RATIO = 3;
const PREVIEW_FAILED_MESSAGE = '미리보기를 그리지 못했어요. 다시 열어 주세요.';

interface QrCardPreviewProps {
  design: QrCardDesignDto;
  qrUrl: string;
  logo: HTMLImageElement | null;
  wordmark: HTMLImageElement | null;
}

function copyCanvas(from: HTMLCanvasElement, to: HTMLCanvasElement): void {
  to.width = from.width;
  to.height = from.height;
  const ctx = to.getContext('2d');
  if (!ctx) throw new Error('미리보기 캔버스를 준비하지 못했어요');
  ctx.drawImage(from, 0, 0);
}

/**
 * 실제 비율 미리보기 (docs/specs/qr-card §5.2). 요청마다 화면 밖 캔버스에 그리고,
 * 그사이 더 새 요청이 없을 때만 화면 캔버스로 옮긴다. 겹친 렌더가 늦게 끝나도 지난 값이 덮지 않는다.
 */
export default function QrCardPreview({ design, qrUrl, logo, wordmark }: QrCardPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestId = useRef(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const id = ++requestId.current;
    const offscreen = document.createElement('canvas');
    const pixelWidth = Math.round(PREVIEW_MAX_CSS_PX * Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
    renderQrCard(offscreen, { design, qrUrl, logo, wordmark, pixelWidth })
      .then(() => {
        if (id !== requestId.current || !canvasRef.current) return;
        copyCanvas(offscreen, canvasRef.current);
        setErrorMessage(null);
      })
      .catch(() => {
        if (id === requestId.current) setErrorMessage(PREVIEW_FAILED_MESSAGE);
      });
  }, [design, qrUrl, logo, wordmark]);

  return (
    <>
      <canvas
        ref={canvasRef}
        className={`qr-card-preview qr-card-preview--${design.layout.toLowerCase()}`}
        role="img"
        aria-label="QR 카드 미리보기"
      />
      <InlineAlert message={errorMessage} textStyle="t4Regular" />
    </>
  );
}
