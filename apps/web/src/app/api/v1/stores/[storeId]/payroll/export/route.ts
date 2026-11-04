import { payrollCsvFileName } from '@/features/payroll/model/payroll-csv';
import { PayrollExportQuery } from '@/features/payroll/schema';
import { buildDetailCsv, buildSummaryCsv } from '@/features/payroll/server/payroll-export';
import { loadPayroll } from '@/features/payroll/server/payroll-service';
import { db } from '@/server/db';
import { defineRoute } from '@/server/http/define-route';

/** GET /api/v1/stores/:storeId/payroll/export — CSV 다운로드 (docs/specs/payroll/README.md §5) */
export const GET = defineRoute<undefined, typeof PayrollExportQuery._output, { storeId: string }>(
  { query: PayrollExportQuery },
  async ({ params, query, userId }) => {
    const payroll = await loadPayroll(db, {
      storeId: params.storeId,
      actorUserId: userId,
      periodStart: query.periodStart,
      now: new Date(),
    });
    const fileName = payrollCsvFileName({ storeName: payroll.storeName, ...payroll.preview.period, detail: query.detail });
    return new Response(query.detail ? buildDetailCsv(payroll) : buildSummaryCsv(payroll), {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        // 한글 파일명은 RFC 5987 형식으로. 구형 브라우저용 ASCII 이름을 같이 둔다
        'content-disposition': `attachment; filename="payroll.csv"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        'cache-control': 'no-store',
      },
    });
  },
);
