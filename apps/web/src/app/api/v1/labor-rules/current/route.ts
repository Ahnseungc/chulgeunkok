import { LaborRuleQuery } from '@/features/labor/schema';
import { findRuleSet } from '@/features/labor/server/labor-context';
import { db } from '@/server/db';
import { defineRoute } from '@/server/http/define-route';

/** GET /api/v1/labor-rules/current?date= — 근로조건 폼의 최저임금 안내용 (docs/specs/labor/README.md §8) */
export const GET = defineRoute({ query: LaborRuleQuery }, async ({ query }) => {
  const rule = await findRuleSet(db, query.date);
  return { version: rule.version, minimumHourlyWage: rule.minimumHourlyWage };
});
