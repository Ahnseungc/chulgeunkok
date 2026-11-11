import { NextResponse, type NextRequest } from 'next/server';

import { runMissingClockOutJob } from '@/features/attendance/server/missing-clock-out-job';
import { runDailyReviewJob } from '@/features/labor/server/work-record-review-service';
import { runPayslipDraftJob } from '@/features/payslip/server/payslip-sync-service';
import { db } from '@/server/db';
import { ApiError } from '@/server/http/api-error';
import { isAuthorizedCronRequest } from '@/server/http/cron-auth';
import { toErrorResponse } from '@/server/http/define-route';

/**
 * 내부 배치. 외부 스케줄러가 부른다 (README "배치").
 * - missing-clock-out: 10분마다 — 퇴근 누락 자동 전환 (docs/specs/attendance §5.1)
 * - daily-reviews: 매일 06:00 — 결근 의심 + 최근 근무 재평가 (docs/specs/labor §5)
 * - payslip-drafts: 매일 06:10 — 끝난 최근 3기간 임금명세서 초안·정정본 (docs/specs/payslip §4.3)
 */
const JOBS = {
  'missing-clock-out': runMissingClockOutJob,
  'daily-reviews': runDailyReviewJob,
  'payslip-drafts': runPayslipDraftJob,
} as const satisfies Record<string, (database: typeof db, now: Date) => Promise<object>>;

async function handle(req: NextRequest, segment: { params: Promise<{ job: string }> }) {
  try {
    if (!isAuthorizedCronRequest(req.headers.get('authorization'))) throw new ApiError('UNAUTHENTICATED');
    const { job } = await segment.params;
    const run = JOBS[job as keyof typeof JOBS];
    if (!run) throw new ApiError('NOT_FOUND');
    const startedAt = Date.now();
    const result = await run(db, new Date());
    console.info(`[jobs] ${job}`, result, `${Date.now() - startedAt}ms`);
    return NextResponse.json({ job, ...result });
  } catch (error) {
    return toErrorResponse(error);
  }
}

// Vercel Cron은 GET으로 부른다. 수동 실행은 POST
export const GET = handle;
export const POST = handle;
