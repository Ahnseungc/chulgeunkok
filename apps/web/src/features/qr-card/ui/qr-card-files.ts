/**
 * QR 카드 화면의 브라우저 파일 일: 이미지 불러오기, 로고 줄이기, PDF·PNG 받기. 정본: docs/specs/qr-card §4.3, §5, §8
 */

import { saveFile } from '@/shared/lib/save-file';

import { QR_CARD_WHITE_BOX } from '../model/qr-card-colors';
import { QR_CARD_PIXELS } from '../model/qr-card-layout';
import { QR_LOGO_MAX_BYTES, type QrCardDesignDto } from '../model/qr-card-types';

import { qrCardFileName, qrCardToPdf, qrCardToPng } from './export-qr-card';
import { renderQrCard } from './render-qr-card';

/** 로고는 긴 변 512px PNG, 200KB 를 넘으면 JPEG·더 작은 변으로 다시 줄인다 (§4.3) */
const LOGO_SIDES_PX = [512, 384] as const;
const LOGO_JPEG_QUALITIES = [0.9, 0.6] as const;
const LOGO_TOO_LARGE_MESSAGE = '로고가 너무 커요. 더 단순하거나 작은 이미지로 올려 주세요.';
const LOGO_UNREADABLE_MESSAGE = '이미지를 읽지 못했어요. 다른 PNG나 JPG로 올려 주세요.';
const BASE64_BYTES_PER_CHAR = 3 / 4;
export const QR_LOGO_ACCEPT = 'image/png,image/jpeg';
const LOGO_TYPES: ReadonlySet<string> = new Set(QR_LOGO_ACCEPT.split(','));

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

/** 로고를 줄이다 실패. 문구를 그대로 화면에 보여 준다 */
export class QrLogoResizeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QrLogoResizeError';
  }
}

/** dataUrl 을 디코드한 바이트 수 (서버가 재는 기준, §8) */
function decodedBytesOf(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return base64.length * BASE64_BYTES_PER_CHAR - padding;
}

const fits = (dataUrl: string) => decodedBytesOf(dataUrl) <= QR_LOGO_MAX_BYTES;

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new QrLogoResizeError(LOGO_UNREADABLE_MESSAGE);
  return ctx;
}

/** 긴 변을 maxSide 이하로 줄여 그린 캔버스. background 가 있으면 먼저 칠한다 (JPEG 는 투명이 없다) */
function drawLogo(image: HTMLImageElement, maxSide: number, background?: string): HTMLCanvasElement {
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(image.naturalWidth * scale);
  canvas.height = Math.round(image.naturalHeight * scale);
  const ctx = context2d(canvas);
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** PNG 먼저, 크면 흰 바탕 JPEG 를 품질을 낮춰 가며. 안 맞으면 null */
function encodeWithinLimit(image: HTMLImageElement, maxSide: number): string | null {
  const png = drawLogo(image, maxSide).toDataURL('image/png');
  if (fits(png)) return png;
  const flattened = drawLogo(image, maxSide, QR_CARD_WHITE_BOX);
  for (const quality of LOGO_JPEG_QUALITIES) {
    const jpeg = flattened.toDataURL('image/jpeg', quality);
    if (fits(jpeg)) return jpeg;
  }
  return null;
}

async function decodeLogo(objectUrl: string): Promise<HTMLImageElement> {
  try {
    return await loadImage(objectUrl);
  } catch {
    throw new QrLogoResizeError(LOGO_UNREADABLE_MESSAGE);
  }
}

/** 서버 상한(디코드 200KB) 안에 드는 dataUrl. 사진 로고는 대개 JPEG 로 나간다 (§4.3) */
export async function resizeLogo(file: File): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await decodeLogo(objectUrl);
    for (const side of LOGO_SIDES_PX) {
      const dataUrl = encodeWithinLimit(image, side);
      if (dataUrl) return dataUrl;
    }
    throw new QrLogoResizeError(LOGO_TOO_LARGE_MESSAGE);
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

/** 화면의 지금 값으로 파일을 만들어 받는다. 자동 저장을 기다리지 않는다 (§8) */
export async function downloadQrCard(design: QrCardDesignDto, images: QrCardImages, kind: QrCardFileKind): Promise<void> {
  const blob = await buildQrCardFile(design, images, kind);
  const fileName = qrCardFileName({ storeName: design.title, layout: design.layout, ext: kind });
  await saveFile(blob, fileName, kind === 'pdf' ? 'application/pdf' : 'image/png');
}
