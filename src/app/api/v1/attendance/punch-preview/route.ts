import { PunchPreviewQuery } from '@/features/attendance/schema';
import { notImplemented } from '@/server/http/api-error';
import { defineRoute } from '@/server/http/define-route';

/** GET /api/v1/attendance/punch-preview — docs/specs/attendance/README.md §3.2 */
export const GET = defineRoute({ query: PunchPreviewQuery }, async () => notImplemented());
