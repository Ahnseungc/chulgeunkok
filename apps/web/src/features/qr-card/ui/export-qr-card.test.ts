import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import { qrCardFileName, qrCardToPdf } from './export-qr-card';

/** 1×1 흰색 PNG */
const PNG_1X1 = Uint8Array.from(
  Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGP4DwQACfsD/fteaysAAAAASUVORK5CYII=', 'base64'),
);

const pageSizeOf = async (bytes: Uint8Array) => {
  const doc = await PDFDocument.load(bytes);
  expect(doc.getPageCount()).toBe(1);
  const { width, height } = doc.getPage(0).getSize();
  return { width: Number(width.toFixed(2)), height: Number(height.toFixed(2)) };
};

describe('qrCardToPdf', () => {
  it('스탠드 페이지는 297.64×419.53pt', async () => {
    expect(await pageSizeOf(await qrCardToPdf(PNG_1X1, 'STAND'))).toEqual({ width: 297.64, height: 419.53 });
  });
  it('스티커는 226.77×226.77pt', async () => {
    expect(await pageSizeOf(await qrCardToPdf(PNG_1X1, 'STICKER'))).toEqual({ width: 226.77, height: 226.77 });
  });
});

describe('qrCardFileName', () => {
  it('스탠드 PDF', () => {
    expect(qrCardFileName({ storeName: '출근콕 카페', layout: 'STAND', ext: 'pdf' })).toBe('출근콕-QR카드-출근콕 카페-스탠드.pdf');
  });
  it('스티커 PNG', () => {
    expect(qrCardFileName({ storeName: '출근콕 카페', layout: 'STICKER', ext: 'png' })).toBe('출근콕-QR카드-출근콕 카페-스티커.png');
  });
  it('파일 이름에 못 쓰는 글자는 _ 로 바꾼다', () => {
    expect(qrCardFileName({ storeName: 'A/B:C', layout: 'STAND', ext: 'png' })).toBe('출근콕-QR카드-A_B_C-스탠드.png');
  });
});
