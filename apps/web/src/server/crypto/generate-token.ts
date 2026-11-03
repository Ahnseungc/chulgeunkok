import { randomBytes } from 'node:crypto';

const TOKEN_BYTES = 32;

/** QR·초대·기기 토큰 원문. 32바이트 base64url = 43자 (docs/specs/store §5.1, auth §3.1) */
export function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}
