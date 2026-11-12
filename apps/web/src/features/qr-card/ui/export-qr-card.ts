/**
 * QR 카드 파일 만들기. 정본: docs/specs/qr-card §5, §8
 * 캔버스로 그린 카드를 PNG로 뽑고, PDF는 그 PNG를 실제 크기 한 장에 넣는다 (한글 폰트 임베딩 불필요).
 */

import { PDFDocument } from 'pdf-lib';

import { QR_CARD_SIZE_MM } from '../model/qr-card-layout';
import type { QrCardLayoutKey } from '../model/qr-card-types';

const POINTS_PER_INCH = 72;
const MM_PER_INCH = 25.4;
const mmToPt = (mm: number) => (mm * POINTS_PER_INCH) / MM_PER_INCH;

const LAYOUT_FILE_LABEL: Record<QrCardLayoutKey, string> = { STAND: '스탠드', STICKER: '스티커' };
/** Windows·macOS 파일 이름에 못 쓰는 글자와 제어 문자 */
const UNSAFE_FILE_CHARS = /[\\/:*?"<>|\u0000-\u001f]/g;

export function qrCardToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('QR 카드 이미지를 만들지 못했어요'))), 'image/png');
  });
}

/** 카드 실제 크기(A6 또는 80×80mm) 한 페이지에 PNG를 꽉 채운다 (§5) */
export async function qrCardToPdf(png: Uint8Array, layout: QrCardLayoutKey): Promise<Uint8Array> {
  const size = QR_CARD_SIZE_MM[layout];
  const width = mmToPt(size.width);
  const height = mmToPt(size.height);
  const doc = await PDFDocument.create();
  const image = await doc.embedPng(png);
  doc.addPage([width, height]).drawImage(image, { x: 0, y: 0, width, height });
  return doc.save();
}

/** `출근콕-QR카드-<매장명>-스탠드.pdf` */
export function qrCardFileName(input: { storeName: string; layout: QrCardLayoutKey; ext: 'pdf' | 'png' }): string {
  const storeName = input.storeName.replace(UNSAFE_FILE_CHARS, '_').trim();
  return `출근콕-QR카드-${storeName}-${LAYOUT_FILE_LABEL[input.layout]}.${input.ext}`;
}
