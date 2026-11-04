import { RedeemHandoffBody } from '@/features/auth/schema';
import { redeemHandoffCode } from '@/features/auth/server/handoff-service';
import { db } from '@/server/db';
import { defineRoute } from '@/server/http/define-route';

/**
 * POST /api/v1/auth/handoff/redeem (공개) — 앱 네이티브 전용. 새 기기 토큰을 본문으로 돌려준다.
 * 앱은 이 토큰을 SecureStore에만 두고 Bearer로 쓴다 (docs/specs/auth/README.md §6.2)
 */
export const POST = defineRoute({ auth: 'public', body: RedeemHandoffBody }, async ({ req, body }) => {
  const { deviceToken } = await redeemHandoffCode(db, {
    code: body.code,
    userAgent: req.headers.get('user-agent'),
    now: new Date(),
  });
  return { deviceToken };
});
