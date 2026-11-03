import { notImplemented } from '@/server/http/api-error';
import { defineRoute } from '@/server/http/define-route';
import { StoreIdQuery } from '@/shared/schema/common';

/** GET /api/v1/attendance/current — docs/specs/attendance/README.md §9 */
export const GET = defineRoute({ query: StoreIdQuery }, async () => notImplemented());
