import { SendOtpBody } from '@/features/auth/schema';
import { notImplemented } from '@/server/http/api-error';
import { defineRoute } from '@/server/http/define-route';

/** POST /api/v1/auth/otp/send — docs/specs/auth/README.md §8 */
export const POST = defineRoute({ auth: 'public', body: SendOtpBody }, async () => notImplemented());
