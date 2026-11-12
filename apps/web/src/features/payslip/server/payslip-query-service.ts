/**
 * 임금명세서 목록·상세 조회. 정본: docs/specs/payslip §5.1·§5.2·§7
 * 조회 권한: Owner·`PAYROLL_READ` Manager, 본인은 보낸 명세서(SENT·SUPERSEDED)만 (인덱스 §2.5).
 */

import type { DbClient, Membership, Payslip, PayslipLine, PrismaClient } from '@chulgeunkok/db';

import { localMidnight, payPeriodConfigOf, type PayPeriod } from '@/features/payroll/model/work-time';
import { resolvePeriod } from '@/features/payroll/server/period-attendances';
import { canReadPayroll, requireMembership } from '@/server/auth/require-membership';
import { ApiError } from '@/server/http/api-error';

import type { MyPayslipListItemDto, PayslipDetailDto, PayslipListDto, PayslipListItemDto } from '../model/payslip-types';

import { syncPeriodPayslips, toDateColumn, toLineDraft } from './payslip-sync-service';

type PayslipWithLines = Payslip & { lines: PayslipLine[] };

const toIsoDate = (date: Date) => date.toISOString().slice(0, 10);
const LINE_ORDER = [{ kind: 'asc' as const }, { sortOrder: 'asc' as const }];

/**
 * GET /stores/:storeId/payslips — §7. 끝난 기간이면 먼저 동기화해 초안·정정본을 맞춘다 (§4.3).
 * 기간을 빼면 끝난 최근 기간 (명세서는 끝난 기간에만 생긴다, §5.1).
 */
export async function listStorePayslips(
  db: PrismaClient,
  input: { storeId: string; actorUserId: string; periodStart?: string; now: Date },
): Promise<PayslipListDto> {
  await requireMembership({ storeId: input.storeId, userId: input.actorUserId, action: 'PAYROLL' }, db);
  const store = await db.store.findUniqueOrThrow({ where: { id: input.storeId } });
  const payPeriod = payPeriodConfigOf(store);
  const periodStart = input.periodStart ?? resolvePeriod({ payPeriod, now: input.now }).prevStart;
  const period = resolvePeriod({ periodStart, payPeriod, now: input.now });
  await syncPeriodPayslips(db, { storeId: input.storeId, periodStart: period.start, now: input.now });

  const payslips = await db.payslip.findMany({
    where: { storeId: input.storeId, periodStart: toDateColumn(period.start) },
    orderBy: { version: 'desc' },
    include: { membership: { include: { user: { select: { _count: { select: { pushTokens: true } } } } } } },
  });
  const latestByMember = new Map<string, (typeof payslips)[number]>();
  for (const payslip of payslips) if (!latestByMember.has(payslip.membershipId)) latestByMember.set(payslip.membershipId, payslip);

  const unresolved = await countUnresolved(db, { storeId: input.storeId, period });
  const items = [...latestByMember.values()]
    .map((payslip) =>
      toListItem(payslip, {
        pushEnabled: payslip.membership.user._count.pushTokens > 0,
        unresolvedCount: unresolved.get(payslip.membershipId) ?? 0,
      }),
    )
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  return { period, counts: countsOf(items), items };
}

const countBy = (keys: readonly string[]) =>
  keys.reduce((counts, key) => counts.set(key, (counts.get(key) ?? 0) + 1), new Map<string, number>());

/**
 * 직원별 미해결 항목 수 (§4.3 배지): 기간 안에 출근한 퇴근 누락 + 그 근무에 걸린 대기 중 수정 요청.
 * 정산 미리보기 플래그(payroll §4)와 같은 상태값을 보되, 목록·상세가 같은 수를 보이도록 기간 안 출근으로 한정한다.
 */
export async function countUnresolved(
  db: DbClient,
  input: { storeId: string; period: PayPeriod; membershipId?: string },
): Promise<Map<string, number>> {
  const inPeriod = {
    storeId: input.storeId,
    ...(input.membershipId ? { membershipId: input.membershipId } : {}),
    clockInAt: { gte: localMidnight(input.period.start), lt: localMidnight(input.period.end) },
  };
  const [missing, corrections] = await Promise.all([
    db.attendance.findMany({ where: { ...inPeriod, status: 'MISSING_CLOCK_OUT' }, select: { membershipId: true } }),
    db.correctionRequest.findMany({
      where: { status: 'PENDING', attendance: inPeriod },
      select: { attendance: { select: { membershipId: true } } },
    }),
  ]);
  return countBy([...missing.map((row) => row.membershipId), ...corrections.map((row) => row.attendance.membershipId)]);
}

const toListItem = (payslip: Payslip, extra: Pick<PayslipListItemDto, 'pushEnabled' | 'unresolvedCount'>): PayslipListItemDto => ({
  payslipId: payslip.id,
  memberId: payslip.membershipId,
  name: payslip.employeeName,
  version: payslip.version,
  status: payslip.status,
  netPay: payslip.netPay,
  payDate: payslip.payDate ? toIsoDate(payslip.payDate) : null,
  viewed: payslip.viewedAt !== null,
  isCorrection: payslip.version > 1,
  ...extra,
});

const countsOf = (items: readonly PayslipListItemDto[]): PayslipListDto['counts'] => ({
  draft: items.filter((item) => item.status === 'DRAFT' && !item.isCorrection).length,
  sent: items.filter((item) => item.status === 'SENT').length,
  correction: items.filter((item) => item.status === 'DRAFT' && item.isCorrection).length,
});

/** GET /payslips/:id — §7. 사장님·`PAYROLL_READ`, 본인은 SENT·SUPERSEDED만 (INACTIVE 본인 포함, §1-6) */
export async function getPayslip(db: DbClient, input: { payslipId: string; actorUserId: string }): Promise<PayslipDetailDto> {
  const payslip = await db.payslip.findUnique({
    where: { id: input.payslipId },
    include: { membership: true, store: { select: { name: true } }, lines: { orderBy: LINE_ORDER } },
  });
  if (!payslip) throw new ApiError('NOT_FOUND');
  await assertCanRead(db, { payslip, membership: payslip.membership, actorUserId: input.actorUserId });
  return {
    ...toDetailDto(payslip),
    storeName: payslip.store.name,
    unresolvedCount: await draftUnresolvedCount(db, payslip),
    previousSent: await findPreviousSent(db, payslip),
  };
}

/** DRAFT의 미해결 항목 수 (§4.3 배지·§5.2 경고). 보낸 명세서는 0 */
async function draftUnresolvedCount(db: DbClient, payslip: Payslip): Promise<number> {
  if (payslip.status !== 'DRAFT') return 0;
  const period = { start: toIsoDate(payslip.periodStart), end: toIsoDate(payslip.periodEnd) };
  const counts = await countUnresolved(db, { storeId: payslip.storeId, period, membershipId: payslip.membershipId });
  return counts.get(payslip.membershipId) ?? 0;
}

/** 본인 명세서면 조회 권한이 없어도 보낸 것은 볼 수 있다. DRAFT는 본인에게 없는 것으로 보인다 (§5.3) */
async function assertCanRead(
  db: DbClient,
  input: { payslip: Payslip; membership: Membership; actorUserId: string },
): Promise<void> {
  const { payslip, membership } = input;
  if (membership.userId !== input.actorUserId) {
    await requireMembership({ storeId: payslip.storeId, userId: input.actorUserId, action: 'PAYROLL' }, db);
    return;
  }
  const canReadStore = membership.status === 'ACTIVE' && (await canReadPayroll(db, membership));
  if (!canReadStore && payslip.status === 'DRAFT') throw new ApiError('NOT_FOUND');
}

/** 정정본의 같은 기간 직전 보낸 본 (§5.2 "이전 버전") */
async function findPreviousSent(db: DbClient, payslip: Payslip): Promise<PayslipDetailDto | null> {
  if (payslip.version === 1) return null;
  const previous = await db.payslip.findFirst({
    where: {
      membershipId: payslip.membershipId,
      periodStart: payslip.periodStart,
      version: { lt: payslip.version },
      status: { in: ['SENT', 'SUPERSEDED'] },
    },
    orderBy: { version: 'desc' },
    include: { store: { select: { name: true } }, lines: { orderBy: LINE_ORDER } },
  });
  return previous ? { ...toDetailDto(previous), storeName: previous.store.name, unresolvedCount: 0, previousSent: null } : null;
}

function toDetailDto(payslip: PayslipWithLines): Omit<PayslipDetailDto, 'previousSent' | 'storeName' | 'unresolvedCount'> {
  return {
    id: payslip.id,
    storeId: payslip.storeId,
    membershipId: payslip.membershipId,
    periodStart: toIsoDate(payslip.periodStart),
    periodEnd: toIsoDate(payslip.periodEnd),
    version: payslip.version,
    status: payslip.status,
    payDate: payslip.payDate ? toIsoDate(payslip.payDate) : null,
    employeeName: payslip.employeeName,
    employeeNumber: payslip.employeeNumber,
    workDays: payslip.workDays,
    recognizedSeconds: payslip.recognizedSeconds,
    overtimeSeconds: payslip.overtimeSeconds,
    nightSeconds: payslip.nightSeconds,
    holidaySeconds: payslip.holidaySeconds,
    deductionType: payslip.deductionType,
    grossPay: payslip.grossPay,
    totalDeduction: payslip.totalDeduction,
    netPay: payslip.netPay,
    correctionNote: payslip.correctionNote,
    sentAt: payslip.sentAt?.toISOString() ?? null,
    viewedAt: payslip.viewedAt?.toISOString() ?? null,
    lines: payslip.lines.map(toLineDraft),
  };
}

/** GET /attendance/me/payslips — §5.3·§7. 본인 SENT·SUPERSEDED만, 최신 기간 먼저. INACTIVE 본인도 (§1-6) */
export async function listMyPayslips(db: DbClient, input: { userId: string; storeId: string }): Promise<MyPayslipListItemDto[]> {
  const payslips = await db.payslip.findMany({
    where: {
      storeId: input.storeId,
      status: { in: ['SENT', 'SUPERSEDED'] },
      membership: { userId: input.userId },
    },
    orderBy: [{ periodStart: 'desc' }, { version: 'desc' }],
  });
  return payslips.map((payslip) => ({
    payslipId: payslip.id,
    periodStart: toIsoDate(payslip.periodStart),
    periodEnd: toIsoDate(payslip.periodEnd),
    version: payslip.version,
    status: payslip.status,
    payDate: payslip.payDate ? toIsoDate(payslip.payDate) : null,
    netPay: payslip.netPay,
    sentAt: payslip.sentAt?.toISOString() ?? null,
    viewed: payslip.viewedAt !== null,
    isCorrection: payslip.version > 1,
  }));
}

/** POST /payslips/:id/view — §5.3·§7. 본인 보낸 명세서의 첫 열람 시각만 남긴다. 남의 것·DRAFT는 NOT_FOUND */
export async function markPayslipViewed(db: DbClient, input: { payslipId: string; userId: string; now: Date }): Promise<void> {
  const payslip = await db.payslip.findUnique({ where: { id: input.payslipId }, include: { membership: true } });
  if (!payslip || payslip.membership.userId !== input.userId || payslip.status === 'DRAFT') throw new ApiError('NOT_FOUND');
  await db.payslip.updateMany({ where: { id: payslip.id, viewedAt: null }, data: { viewedAt: input.now } });
}
