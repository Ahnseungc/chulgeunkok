/**
 * QR 카드 화면의 브라우저 파일 일: 이미지 불러오기, 로고 줄이기, PDF·PNG 받기. 정본: docs/specs/qr-card §4.3, §5, §8
 */

import { QR_CARD_PIXELS } from '../model/qr-card-layout';
import type { QrCardDesignDto } from '../model/qr-card-types';

import { qrCardFileName, qrCardToPdf, qrCardToPng } from './export-qr-card';
import { renderQrCard } from './render-qr-card';

/** 로고는 긴 변 512px PNG로 줄여 올린다 (§4.3) */
const LOGO_MAX_SIDE_PX = 512;
export const QR_LOGO_ACCEPT = 'image/png,image/jpeg';
const LOGO_TYPES: ReadonlySet<string> = new Set(QR_LOGO_ACCEPT.split(','));
/** 클릭 직후 바로 풀면 Safari 가 받기를 놓친다 */
const OBJECT_URL_REVOKE_DELAY_MS = 1000;

export type QrCardFileKind = 'pdf' | 'png';

export interface QrCardImages {
  qrUrl: string;
  logo: HTMLImageElement | null;
  wordmark: HTMLImageElement | null;
}

/** 디코드까지 끝난 이미지. 실패하면 reject */
export async function loadImage(src: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = src;
  await image.decode();
  return image;
}

export const isLogoType = (file: File) => LOGO_TYPES.has(file.type);

/** 긴 변이 512px 를 넘으면 비율대로 줄여 PNG dataUrl 로 만든다 */
export async function resizeLogo(file: File): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(objectUrl);
    const scale = Math.min(1, LOGO_MAX_SIDE_PX / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(image.naturalWidth * scale);
    canvas.height = Math.round(image.naturalHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('로고를 줄일 캔버스를 준비하지 못했어요');
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/** 300dpi 크기로 새 캔버스에 그려 PNG, PDF는 그 PNG를 실제 크기로 (§5, §8) */
async function buildQrCardFile(design: QrCardDesignDto, images: QrCardImages, kind: QrCardFileKind): Promise<Blob> {
  const canvas = document.createElement('canvas');
  await renderQrCard(canvas, { design, ...images, pixelWidth: QR_CARD_PIXELS[design.layout].width });
  const png = await qrCardToPng(canvas);
  if (kind === 'png') return png;
  const pdf = await qrCardToPdf(new Uint8Array(await png.arrayBuffer()), design.layout);
  return new Blob([pdf.slice()], { type: 'application/pdf' });
}

function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), OBJECT_URL_REVOKE_DELAY_MS);
}

/** 화면의 지금 값으로 파일을 만들어 받는다. 자동 저장을 기다리지 않는다 (§8) */
export async function downloadQrCard(design: QrCardDesignDto, images: QrCardImages, kind: QrCardFileKind): Promise<void> {
  const blob = await buildQrCardFile(design, images, kind);
  saveBlob(blob, qrCardFileName({ storeName: design.title, layout: design.layout, ext: kind }));
}
