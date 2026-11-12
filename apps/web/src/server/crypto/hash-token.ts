import { createHash } from 'node:crypto';

/** QR·초대 토큰 원문 → DB 저장용 해시. 원문 평문은 저장하지 않는다 (docs/specs/store §5.1) */
export function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}
