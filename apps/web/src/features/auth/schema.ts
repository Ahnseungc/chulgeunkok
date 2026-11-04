import { z } from 'zod';

import { KoreanMobilePhone } from '@/shared/schema/common';

/** docs/specs/auth §8 */
export const SendOtpBody = z.object({ phone: KoreanMobilePhone });

export const VerifyOtpBody = z.object({
  phone: KoreanMobilePhone,
  code: z.string().regex(/^\d{6}$/, '6자리 숫자를 입력해 주세요.'),
});

export const UpdateMeBody = z.object({ name: z.string().trim().min(1).max(20) });

/** docs/specs/auth §6.2 */
export const RedeemHandoffBody = z.object({ code: z.string().regex(/^[A-Za-z0-9_-]{43}$/) });
