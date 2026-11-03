import { SendOtpBody } from '@/features/auth/schema';
import { sendOtp } from '@/features/auth/server/otp-service';
import { db } from '@/server/db';
import { defineRoute } from '@/server/http/define-route';
import { getSmsSender } from '@/server/integrations/sms';

/** POST /api/v1/auth/otp/send (공개) — docs/specs/auth/README.md §4 */
export const POST = defineRoute(
  { auth: 'public', body: SendOtpBody },
  async ({ body }) => sendOtp(db, { phone: body.phone, now: new Date(), sender: getSmsSender() }),
);
