import { notImplemented } from '@/server/http/api-error';
import { defineRoute } from '@/server/http/define-route';

/** POST /api/v1/stores/:storeId/qr/rotate — docs/specs/store/README.md §5.2 */
export const POST = defineRoute({}, async () => notImplemented());
