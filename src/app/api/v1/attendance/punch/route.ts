import { PunchBody } from '@/features/attendance/schema';
import { notImplemented } from '@/server/http/api-error';
import { defineRoute } from '@/server/http/define-route';

/** POST /api/v1/attendance/punch — docs/specs/attendance/README.md §3.3 */
export const POST = defineRoute({ body: PunchBody }, async () => notImplemented());
