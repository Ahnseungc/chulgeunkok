import { CreateCorrectionBody } from '@/features/attendance/schema';
import { notImplemented } from '@/server/http/api-error';
import { defineRoute } from '@/server/http/define-route';

/** POST /api/v1/attendances/:attendanceId/correction-requests — docs/specs/attendance/README.md §7.1 */
export const POST = defineRoute({ body: CreateCorrectionBody }, async () => notImplemented());
