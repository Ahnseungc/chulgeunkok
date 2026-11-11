import { z } from 'zod';

/** POST /push-tokens — docs/specs/payslip §6·§7. FCM 등록 토큰과 플랫폼 */
export const RegisterPushTokenBody = z.object({
  token: z.string().min(1).max(4096),
  platform: z.enum(['ios', 'android']),
});
