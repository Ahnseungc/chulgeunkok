import { afterEach, describe, expect, it, vi } from 'vitest';

import { generateToken } from './generate-token';
import { decryptQrToken, encryptQrToken } from './qr-token-cipher';

afterEach(() => {
  vi.unstubAllEnvs();
});

/** 마지막 base64url 글자를 다른 글자로 바꾼다 */
const tamper = (ciphertext: string) => {
  const last = ciphertext.at(-1) === 'A' ? 'B' : 'A';
  return `${ciphertext.slice(0, -1)}${last}`;
};

describe('qr-token-cipher (docs/specs/qr-card §3.1)', () => {
  it('왕복하면 원문이 나온다', () => {
    const raw = generateToken();
    const ciphertext = encryptQrToken(raw);
    expect(ciphertext.startsWith('v1.')).toBe(true);
    expect(ciphertext).not.toContain(raw);
    expect(decryptQrToken(ciphertext)).toBe(raw);
  });

  it('같은 원문도 매번 다른 암호문', () => {
    const raw = generateToken();
    expect(encryptQrToken(raw)).not.toBe(encryptQrToken(raw));
  });

  it('한 글자라도 바뀌면 throw', () => {
    const ciphertext = encryptQrToken(generateToken());
    expect(() => decryptQrToken(tamper(ciphertext))).toThrow();
  });

  it('v1 접두사가 아니면 throw', () => {
    const ciphertext = encryptQrToken(generateToken());
    expect(() => decryptQrToken(ciphertext.replace(/^v1\./, 'v2.'))).toThrow();
    expect(() => decryptQrToken('not-a-ciphertext')).toThrow();
  });

  it('production에서 키가 없으면 INTERNAL', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('QR_TOKEN_ENC_KEY', '');
    expect(() => encryptQrToken(generateToken())).toThrow(expect.objectContaining({ code: 'INTERNAL' }));
  });

  it('설정한 키로 암호화하면 다른 키로는 풀 수 없다', () => {
    vi.stubEnv('QR_TOKEN_ENC_KEY', Buffer.alloc(32, 7).toString('base64'));
    const ciphertext = encryptQrToken(generateToken());
    vi.stubEnv('QR_TOKEN_ENC_KEY', Buffer.alloc(32, 8).toString('base64'));
    expect(() => decryptQrToken(ciphertext)).toThrow();
  });
});
