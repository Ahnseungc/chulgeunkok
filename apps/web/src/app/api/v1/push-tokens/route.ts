import { registerPushToken } from '@/features/push/server/push-token-service';
import { RegisterPushTokenBody } from '@/features/push/schema';
import { db } from '@/server/db';
import { ApiError } from '@/server/http/api-error';
import { defineRoute } from '@/server/http/define-route';

/**
 * POST /api/v1/push-tokens — 기기 푸시 토큰 등록 (docs/specs/payslip/README.md §6·§7)
 * 기기 id가 필요해 세션 대신 `Authorization: Bearer` 기기 토큰 원문을 직접 읽는다.
 */
export const POST = defineRoute({ auth: 'public', body: RegisterPushTokenBody }, async ({ req, body }) => {
  const [scheme, deviceToken] = req.headers.get('authorization')?.split(' ') ?? [];
  if (scheme !== 'Bearer' || !deviceToken) throw new ApiError('UNAUTHENTICATED');
  await registerPushToken(db, { deviceToken, ...body });
  return { ok: true };
});
