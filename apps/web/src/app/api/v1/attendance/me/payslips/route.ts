import { MyPayslipsQuery } from '@/features/payslip/schema';
import { listMyPayslips } from '@/features/payslip/server/payslip-query-service';
import { db } from '@/server/db';
import { defineRoute } from '@/server/http/define-route';

/** GET /api/v1/attendance/me/payslips — 본인 보낸 명세서 목록 (docs/specs/payslip/README.md §5.3·§7) */
export const GET = defineRoute({ query: MyPayslipsQuery }, async ({ query, userId }) => ({
  items: await listMyPayslips(db, { userId, storeId: query.storeId }),
}));
