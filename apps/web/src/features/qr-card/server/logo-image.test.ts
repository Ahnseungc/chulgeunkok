import { describe, expect, it } from 'vitest';

import { ApiError } from '@/server/http/api-error';

import { parseLogoDataUrl } from './logo-image';

const PNG_HEAD = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_HEAD = [0xff, 0xd8, 0xff, 0xe0];
const GIF_HEAD = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61];

const dataUrl = (mime: string, head: number[], size = 16) =>
  `data:${mime};base64,${Buffer.concat([Buffer.from(head), Buffer.alloc(size - head.length)]).toString('base64')}`;

const codeOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    return error instanceof ApiError ? error.code : 'OTHER';
  }
  return null;
};

describe('parseLogoDataUrl', () => {
  it('PNG·JPEG 매직바이트 통과', () => {
    expect(parseLogoDataUrl(dataUrl('image/png', PNG_HEAD)).mime).toBe('image/png');
    expect(parseLogoDataUrl(dataUrl('image/jpeg', JPEG_HEAD)).mime).toBe('image/jpeg');
  });
  it('헤더가 png여도 GIF 바이트면 QR_LOGO_INVALID', () => {
    expect(codeOf(() => parseLogoDataUrl(dataUrl('image/png', GIF_HEAD)))).toBe('QR_LOGO_INVALID');
  });
  it('200KB 넘으면 QR_LOGO_TOO_LARGE', () => {
    expect(codeOf(() => parseLogoDataUrl(dataUrl('image/png', PNG_HEAD, 200 * 1024 + 1)))).toBe('QR_LOGO_TOO_LARGE');
  });
  it('정확히 200KB는 통과', () => {
    expect(parseLogoDataUrl(dataUrl('image/png', PNG_HEAD, 200 * 1024)).bytes.length).toBe(200 * 1024);
  });
  it('data URL 형식이 아니면 QR_LOGO_INVALID', () => {
    expect(codeOf(() => parseLogoDataUrl('hello'))).toBe('QR_LOGO_INVALID');
  });
});
