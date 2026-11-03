import { LaborRuleQuery } from '@/features/labor/schema';
import { notImplemented } from '@/server/http/api-error';
import { defineRoute } from '@/server/http/define-route';

/** GET /api/v1/labor-rules/current — docs/specs/labor/README.md §4.1 */
export const GET = defineRoute({ query: LaborRuleQuery }, async () => notImplemented());
