/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { QR_LOGO_MAX_BYTES } from '../model/qr-card-types';

import { QrLogoResizeError, resizeLogo } from './qr-card-files';

// jsdom 에는 캔버스·이미지 디코드가 없다. 인코딩 결과 크기만 정해 주고 어떤 순서로 줄이는지 본다
vi.mock('./render-qr-card', () => ({ renderQrCard: vi.fn() }));
vi.mock('./export-qr-card', () => ({ qrCardToPng: vi.fn(), qrCardToPdf: vi.fn(), qrCardFileName: vi.fn() }));

const PHOTO = { width: 2000, height: 1000 };
const TOO_BIG = QR_LOGO_MAX_BYTES + 1;
/** base64 4글자 = 3바이트라 3의 배수로 맞춘다 */
const FITS = Math.floor(QR_LOGO_MAX_BYTES / 3) * 3;

/** 디코드하면 bytes 바이트가 되는 dataUrl */
const dataUrlOf = (mime: string, bytes: number) => `data:${mime};base64,${'A'.repeat(Math.ceil(bytes / 3) * 4)}`;
const decodedBytes = (dataUrl: string) => (dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75;

type Encoded = { type: string; quality?: number; width: number; height: number };
type SizeOf = (encoded: Encoded) => number;

const stubCanvas = (sizeOf: SizeOf) => {
  const encoded: Encoded[] = [];
  const fillRect = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => ({ drawImage: vi.fn(), fillRect, fillStyle: '' }) as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(function (
    this: HTMLCanvasElement,
    type = 'image/png',
    quality?: number,
  ) {
    const entry = { type, quality, width: this.width, height: this.height };
    encoded.push(entry);
    return dataUrlOf(type, sizeOf(entry));
  });
  return { encoded, fillRect };
};

const logoFile = () => new File([new Uint8Array([137, 80, 78, 71])], 'logo.png', { type: 'image/png' });

describe('resizeLogo', () => {
  beforeEach(() => {
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:logo'), revokeObjectURL: vi.fn() }));
    Object.defineProperty(HTMLImageElement.prototype, 'decode', { configurable: true, value: async () => {} });
    vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(PHOTO.width);
    vi.spyOn(HTMLImageElement.prototype, 'naturalHeight', 'get').mockReturnValue(PHOTO.height);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('긴 변 512px PNG 가 200KB 이하면 그대로 올린다', async () => {
    const { encoded } = stubCanvas(() => FITS);
    const dataUrl = await resizeLogo(logoFile());
    expect(dataUrl.startsWith('data:image/png;')).toBe(true);
    expect(encoded).toEqual([{ type: 'image/png', quality: undefined, width: 512, height: 256 }]);
  });

  it('PNG 가 크면 흰 바탕에 JPEG 0.9 → 0.6 으로 다시 줄인다', async () => {
    const { encoded, fillRect } = stubCanvas(({ type, quality }) => (type === 'image/jpeg' && quality === 0.6 ? FITS : TOO_BIG));
    const dataUrl = await resizeLogo(logoFile());
    expect(dataUrl.startsWith('data:image/jpeg;')).toBe(true);
    expect(decodedBytes(dataUrl)).toBeLessThanOrEqual(QR_LOGO_MAX_BYTES);
    expect(encoded.map(({ type, quality }) => [type, quality])).toEqual([
      ['image/png', undefined],
      ['image/jpeg', 0.9],
      ['image/jpeg', 0.6],
    ]);
    expect(fillRect).toHaveBeenCalledWith(0, 0, 512, 256);
  });

  it('512px 로 안 되면 긴 변 384px 로 다시 해 본다', async () => {
    const { encoded } = stubCanvas(({ width }) => (width === 384 ? FITS : TOO_BIG));
    const dataUrl = await resizeLogo(logoFile());
    expect(dataUrl.startsWith('data:image/png;')).toBe(true);
    expect(encoded.at(-1)).toEqual({ type: 'image/png', quality: undefined, width: 384, height: 192 });
  });

  it('어떻게 줄여도 크면 알아볼 수 있는 오류', async () => {
    stubCanvas(() => TOO_BIG);
    await expect(resizeLogo(logoFile())).rejects.toBeInstanceOf(QrLogoResizeError);
    await expect(resizeLogo(logoFile())).rejects.toThrow('로고가 너무 커요');
  });
});
