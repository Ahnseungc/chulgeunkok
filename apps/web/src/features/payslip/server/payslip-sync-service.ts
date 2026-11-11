/**
 * 임금명세서 초안 생성·갱신·정정본 동기화와 일배치. 정본: docs/specs/payslip §3.3·§3.4·§4.3
 * 재계산은 정산 미리보기(`computePayroll`, payroll §3)와 같은 결과를 쓴다.
 */

import { Prisma, type DbClient, type DeductionType, type Payslip, type PayslipLine, type PrismaClient } from '@chulgeunkok/db';

import { findEffectiveTerms } from '@/features/attendance/server/punch-context';
import type { PayrollMemberDto } from '@/features/payroll/model/payroll-types';
import { getStorePayPeriod, localMidnight, payPeriodConfigOf, toLocalDate, type PayPeriod } from '@/features/payroll/model/work-time';
import { resolvePeriod } from '@/features/payroll/server/period-attendances';
import { computePayroll } from '@/features/payroll/server/payroll-service';

import { buildEarningLines, hasCalculatedChange, mergeLines, payDateFor, summaryOf, totalsOf } from '../model/payslip-calc';
import type { LineDraft } from '../model/payslip-types';

/** 일배치가 보는 끝난 정산 기간 수. 사업장 규모 소급 90일을 덮는다 (§4.3) */
const JOB_PERIOD_COUNT = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

type SyncOutcome = 'created' | 'updated' | null;
type PayslipWithLines = Payslip & { lines: PayslipLine[] };

interface SyncContext {
  storeId: string;
  period: PayPeriod;
  payDay: number | null;
}

/** `YYYY-MM-DD` → @db.Date 컬럼 값 */
const toDateColumn = (localDate: string) => new Date(`${localDate}T00:00:00Z`);
const dayBefore = (localDate: string) => new Date(Date.parse(`${localDate}T00:00:00Z`) - DAY_MS).toISOString().slice(0, 10);

/** 사원번호: 매장 안 Membership을 (joinedAt, id) 순으로 센 1부터 순번 (§3.1) */
export async function employeeNumberOf(db: DbClient, membership: { id: string; storeId: string }): Promise<number> {
  const { joinedAt } = await db.membership.findUniqueOrThrow({ where: { id: membership.id }, select: { joinedAt: true } });
  const earlier = await db.membership.count({
    where: {
      storeId: membership.storeId,
      OR: [{ joinedAt: { lt: joinedAt } }, { joinedAt, id: { lt: membership.id } }],
    },
  });
  return earlier + 1;
}

/**
 * 끝난 정산 기간 하나의 명세서를 맞춘다 (§4.3). 기간 끝(미포함)이 오늘보다 뒤면 아무것도 안 한다.
 * 직원마다 따로 트랜잭션을 쓴다.
 */
export async function syncPeriodPayslips(
  db: PrismaClient,
  input: { storeId: string; periodStart: string; now: Date },
): Promise<{ created: number; updated: number }> {
  const store = await db.store.findUniqueOrThrow({ where: { id: input.storeId } });
  const period = resolvePeriod({ periodStart: input.periodStart, payPeriod: payPeriodConfigOf(store), now: input.now });
  if (period.end > toLocalDate(input.now)) return { created: 0, updated: 0 };

  const { preview } = await computePayroll(db, input);
  const context: SyncContext = { storeId: input.storeId, period: { start: period.start, end: period.end }, payDay: store.payDay };
  const outcomes: SyncOutcome[] = [];
  for (const member of preview.members) outcomes.push(await syncMemberSafely(db, context, member));
  return {
    created: outcomes.filter((outcome) => outcome === 'created').length,
    updated: outcomes.filter((outcome) => outcome === 'updated').length,
  };
}

/** 같은 직원·기간을 동시에 만들면 DRAFT 부분 유니크·버전 유니크에 걸린다. 먼저 만든 쪽을 둔다 (§4.1) */
async function syncMemberSafely(db: PrismaClient, context: SyncContext, member: PayrollMemberDto): Promise<SyncOutcome> {
  try {
    return await db.$transaction((tx) => syncMember(tx, context, member));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return null;
    throw error;
  }
}

async function syncMember(tx: Prisma.TransactionClient, context: SyncContext, member: PayrollMemberDto): Promise<SyncOutcome> {
  const latest = await tx.payslip.findFirst({
    where: { membershipId: member.memberId, periodStart: toDateColumn(context.period.start) },
    orderBy: { version: 'desc' },
    include: { lines: { orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }] } },
  });
  const fresh = buildEarningLines(member);
  if (!latest) return totalsOf(fresh).grossPay > 0 ? createFirstDraft(tx, context, member) : null;
  if (latest.status === 'DRAFT') return refreshDraft(tx, latest, member);
  if (latest.status === 'SENT') return createCorrectionDraft(tx, latest, member);
  return null;
}

const toLineDraft = (line: PayslipLine): LineDraft => ({
  kind: line.kind,
  code: line.code,
  label: line.label,
  basis: line.basis,
  calculatedAmount: line.calculatedAmount,
  amount: line.amount,
  adjustReason: line.adjustReason,
  sortOrder: line.sortOrder,
});

/** 계산 줄만 갱신한다. 공제 방식은 저장된 값 그대로 (§3.3, §4.3) */
const remerge = (payslip: PayslipWithLines, member: PayrollMemberDto) =>
  mergeLines({
    current: payslip.lines.map(toLineDraft),
    fresh: buildEarningLines(member),
    currentDeductionType: payslip.deductionType,
    deductionType: payslip.deductionType,
    previousSent: [],
  });

/** 줄에서 나오는 스냅숏 필드 (§4.1). 사원번호·지급일은 따로 */
const snapshotOf = (member: PayrollMemberDto, lines: readonly LineDraft[]) => ({
  employeeName: member.name,
  ...summaryOf(member),
  ...totalsOf(lines),
});

/** 최초 v1 DRAFT. 공제 방식은 기간 마지막 날 유효한 근로조건, 지급일은 매장 payDay (§3.3·§3.4) */
async function createFirstDraft(tx: Prisma.TransactionClient, context: SyncContext, member: PayrollMemberDto): Promise<SyncOutcome> {
  const lastMoment = new Date(localMidnight(context.period.end).getTime() - 1);
  const terms = await findEffectiveTerms(tx, { membershipId: member.memberId, at: lastMoment });
  const deductionType: DeductionType = terms?.deductionType ?? 'NONE';
  const previousSent = deductionType === 'SOCIAL_INSURANCE' ? await previousSentLines(tx, member.memberId, context.period.start) : [];
  const lines = mergeLines({ current: [], fresh: buildEarningLines(member), currentDeductionType: 'NONE', deductionType, previousSent });
  const payDate = payDateFor(context.period.end, context.payDay);
  await createDraft(tx, {
    base: { storeId: context.storeId, membershipId: member.memberId, period: context.period, version: 1 },
    deductionType,
    payDate: payDate ? toDateColumn(payDate) : null,
    snapshot: snapshotOf(member, lines),
    lines,
  });
  return 'created';
}

/** 같은 직원의 이전 기간 직전 보낸 명세서 줄 (§3.3 4대보험 기본값) */
async function previousSentLines(tx: Prisma.TransactionClient, membershipId: string, periodStart: string): Promise<LineDraft[]> {
  const previous = await tx.payslip.findFirst({
    where: { membershipId, status: { in: ['SENT', 'SUPERSEDED'] }, periodStart: { lt: toDateColumn(periodStart) } },
    orderBy: [{ periodStart: 'desc' }, { version: 'desc' }],
    include: { lines: true },
  });
  return previous?.lines.map(toLineDraft) ?? [];
}

/** 최신이 DRAFT: 계산 줄·스냅숏이 달라졌을 때만 고친다 (§4.3) */
async function refreshDraft(tx: Prisma.TransactionClient, draft: PayslipWithLines, member: PayrollMemberDto): Promise<SyncOutcome> {
  const lines = remerge(draft, member);
  const snapshot = snapshotOf(member, lines);
  const unchanged =
    JSON.stringify(lines) === JSON.stringify(draft.lines.map(toLineDraft)) &&
    Object.entries(snapshot).every(([key, value]) => draft[key as keyof typeof snapshot] === value);
  if (unchanged) return null;
  await tx.payslipLine.deleteMany({ where: { payslipId: draft.id } });
  await tx.payslip.update({
    where: { id: draft.id },
    data: { ...snapshot, lines: { createMany: { data: lines.map((line) => ({ ...line })) } } },
  });
  return 'updated';
}

/** 최신이 SENT: 계산 지급 줄이 달라졌으면 v+1 DRAFT. 보낸 본의 줄·공제 방식·지급일을 복사한 뒤 merge (§4.2·§4.3) */
async function createCorrectionDraft(tx: Prisma.TransactionClient, sent: PayslipWithLines, member: PayrollMemberDto): Promise<SyncOutcome> {
  if (!hasCalculatedChange(sent.lines.map(toLineDraft), buildEarningLines(member))) return null;
  const lines = remerge(sent, member);
  await createDraft(tx, {
    base: {
      storeId: sent.storeId,
      membershipId: sent.membershipId,
      period: { start: sent.periodStart.toISOString().slice(0, 10), end: sent.periodEnd.toISOString().slice(0, 10) },
      version: sent.version + 1,
    },
    deductionType: sent.deductionType,
    payDate: sent.payDate,
    snapshot: snapshotOf(member, lines),
    lines,
  });
  return 'created';
}

async function createDraft(
  tx: Prisma.TransactionClient,
  input: {
    base: { storeId: string; membershipId: string; period: PayPeriod; version: number };
    deductionType: DeductionType;
    payDate: Date | null;
    snapshot: ReturnType<typeof snapshotOf>;
    lines: readonly LineDraft[];
  },
): Promise<void> {
  const { base } = input;
  await tx.payslip.create({
    data: {
      storeId: base.storeId,
      membershipId: base.membershipId,
      periodStart: toDateColumn(base.period.start),
      periodEnd: toDateColumn(base.period.end),
      version: base.version,
      status: 'DRAFT',
      payDate: input.payDate,
      employeeNumber: await employeeNumberOf(tx, { id: base.membershipId, storeId: base.storeId }),
      deductionType: input.deductionType,
      ...input.snapshot,
      lines: { createMany: { data: input.lines.map((line) => ({ ...line })) } },
    },
  });
}

/** 오늘 기준 이미 끝난(end ≤ 오늘) 최근 기간 시작일들, 최신부터 */
function endedPeriodStarts(store: Parameters<typeof payPeriodConfigOf>[0], today: string): string[] {
  const config = payPeriodConfigOf(store);
  const starts: string[] = [];
  let period = getStorePayPeriod(today, config);
  while (starts.length < JOB_PERIOD_COUNT) {
    period = getStorePayPeriod(dayBefore(period.start), config);
    starts.push(period.start);
  }
  return starts;
}

/** 일배치 payslip-drafts (매일 06:10): ACTIVE 매장마다 끝난 최근 3기간을 동기화 (§4.3) */
export async function runPayslipDraftJob(
  db: PrismaClient,
  now: Date,
): Promise<{ stores: number; created: number; updated: number }> {
  const stores = await db.store.findMany({ where: { status: 'ACTIVE' } });
  const today = toLocalDate(now);
  const totals = { stores: stores.length, created: 0, updated: 0 };
  for (const store of stores) {
    for (const periodStart of endedPeriodStarts(store, today)) {
      const result = await syncPeriodPayslips(db, { storeId: store.id, periodStart, now });
      totals.created += result.created;
      totals.updated += result.updated;
    }
  }
  return totals;
}
