import { ApiError } from '@/server/http/api-error';

import { QR_LOGO_MAX_BYTES } from '../model/qr-card-types';

const DATA_URL = /^data:[\w/+.-]+;base64,([A-Za-z0-9+/]+={0,2})$/;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);

const startsWith = (bytes: Buffer, magic: Buffer) => bytes.subarray(0, magic.length).equals(magic);

/**
 * 로고 data URL → 바이트. 헤더의 MIME은 믿지 않고 매직바이트로 PNG·JPEG를 판별한다.
 * docs/specs/qr-card §4.3·§8
 */
export function parseLogoDataUrl(dataUrl: string): { bytes: Buffer; mime: 'image/png' | 'image/jpeg' } {
  const match = DATA_URL.exec(dataUrl);
  if (!match?.[1]) throw new ApiError('QR_LOGO_INVALID');
  const bytes = Buffer.from(match[1], 'base64');
  if (bytes.length > QR_LOGO_MAX_BYTES) throw new ApiError('QR_LOGO_TOO_LARGE');
  if (startsWith(bytes, PNG_MAGIC)) return { bytes, mime: 'image/png' };
  if (startsWith(bytes, JPEG_MAGIC)) return { bytes, mime: 'image/jpeg' };
  throw new ApiError('QR_LOGO_INVALID');
}
