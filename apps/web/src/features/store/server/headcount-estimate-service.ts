import type { PrismaClient } from '@chulgeunkok/db';

import { findHeadcountBand } from '@/features/labor/server/labor-context';
import { addDays, localMidnight, toLocalDate } from '@/features/payroll/model/work-time';

import { estimateHeadcount, headcountMismatch, type HeadcountEstimate, type HeadcountMismatch } from '../model/headcount-estimate';

export interface MonthlyHeadcountEstimate extends HeadcountEstimate {
  month: string;
  mismatch: HeadcountMismatch | null;
}

/** 오늘이 속한 달의 직전 달 [시작 포함, 끝 미포함) 매장 시간대 날짜 */
function previousMonthRange(today: string) {
  const end = `${today.slice(0, 7)}-01`;
  const start = `${addDays(end, -1).slice(0, 7)}-01`;
  return { start, end, month: start.slice(0, 7) };
}

/**
 * 직전 달 출근 기록으로 상시근로자 수 참고값을 계산한다. VOID·OWNER 제외, 출근 시각의 매장 날짜 기준.
 * 저장하지 않고 요청 때마다 계산한다. 정본: docs/specs/store §6.4
 */
export async function loadHeadcountEstimate(
  db: PrismaClient,
  input: { storeId: string; now: Date },
): Promise<MonthlyHeadcountEstimate | null> {
  const range = previousMonthRange(toLocalDate(input.now));
  const attendances = await db.attendance.findMany({
    where: {
      storeId: input.storeId,
      status: { not: 'VOID' },
      membership: { role: { not: 'OWNER' } },
      clockInAt: { gte: localMidnight(range.start), lt: localMidnight(range.end) },
    },
    select: { membershipId: true, clockInAt: true },
  });
  const estimate = estimateHeadcount(
    attendances.map((row) => ({ localDate: toLocalDate(row.clockInAt), membershipId: row.membershipId })),
  );
  if (estimate.operatingDays === 0) return null;
  const band = await findHeadcountBand(db, { storeId: input.storeId, localDate: addDays(range.end, -1) });
  const mismatch = headcountMismatch(estimate.workerDays / estimate.operatingDays, band);
  return { ...estimate, month: range.month, mismatch };
}
