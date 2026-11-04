import { timingSafeEqual } from 'node:crypto';

/**
 * 내부 배치 호출 인증. `Authorization: Bearer <CRON_SECRET>` (Vercel Cron 등 외부 스케줄러).
 * 비밀값이 설정되지 않았으면 항상 거부한다 — 공개 URL에서 배치가 열리면 안 된다.
 */
export function isAuthorizedCronRequest(authorization: string | null, secret = process.env.CRON_SECRET): boolean {
  if (!secret || !authorization?.startsWith('Bearer ')) return false;
  const given = Buffer.from(authorization.slice('Bearer '.length));
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
