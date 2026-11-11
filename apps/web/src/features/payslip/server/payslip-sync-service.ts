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
import { CUSTOM_CODE, type LineDraft, type PayslipLineDto } from '../model/payslip-types';

/** 일배치가 보는 끝난 정산 기간 수. 사업장 규모 소급 90일을 덮는다 (§4.3) */
const JOB_PERIOD_COUNT = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

type SyncOutcome = 'created' | 'updated' | null;
type PayslipWithLines = Payslip & { lines: PayslipLine[] };

interface SyncContext {
  storeId: string;
  period: PayPeriod;
  payDay: number | null;
  /** false면 명세서가 없는 직원에게 v1을 만들지 않고 있는 것만 맞춘다 (일배치의 지난 기간, §4.3) */
  createFirst: boolean;
}

/** syncPeriodPayslips 입력. createFirst 기본값 true (§4.3) */
export interface SyncPeriodInput {
  storeId: string;
  periodStart: string;
  now: Date;
  createFirst?: boolean;
}

/** `YYYY-MM-DD` → @db.Date 컬럼 값 */
export const toDateColumn = (localDate: string) => new Date(`${localDate}T00:00:00Z`);
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
 * 직원마다 따로 트랜잭션을 쓴다. `createFirst: false`면 v1은 만들지 않는다.
 */
export async function syncPeriodPayslips(db: PrismaClient, input: SyncPeriodInput): Promise<{ created: number; updated: number }> {
  const store = await db.store.findUniqueOrThrow({ where: { id: input.storeId } });
  const period = resolvePeriod({ periodStart: input.periodStart, payPeriod: payPeriodConfigOf(store), now: input.now });
  if (period.end > toLocalDate(input.now)) return { created: 0, updated: 0 };

  const { preview } = await computePayroll(db, input);
  const context: SyncContext = {
    storeId: input.storeId,
    period: { start: period.start, end: period.end },
    payDay: store.payDay,
    createFirst: input.createFirst ?? true,
  };
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

/**
 * 명세서 행을 잠근다. 동기화와 줄 수정(§7 PUT /payslips/:id/lines/:lineId)이 같은 명세서를 동시에 고치지 않게 한다.
 * 잠근 뒤 줄을 다시 읽어야 한다.
 */
export async function lockPayslip(tx: Prisma.TransactionClient, payslipId: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "Payslip" WHERE "id" = ${payslipId} FOR UPDATE`;
}

async function syncMember(tx: Prisma.TransactionClient, context: SyncContext, member: PayrollMemberDto): Promise<SyncOutcome> {
  const latest = await tx.payslip.findFirst({
    where: { membershipId: member.memberId, periodStart: toDateColumn(context.period.start) },
    orderBy: { version: 'desc' },
    select: { id: true },
  });
  if (!latest) {
    const paid = totalsOf(buildEarningLines(member)).grossPay > 0;
    return context.createFirst && paid ? createFirstDraft(tx, context, member) : null;
  }
  await lockPayslip(tx, latest.id);
  const payslip = await tx.payslip.findUniqueOrThrow({
    where: { id: latest.id },
    include: { lines: { orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }] } },
  });
  if (payslip.status === 'DRAFT') return refreshDraft(tx, context, { draft: payslip, member });
  if (payslip.status === 'SENT') return createCorrectionDraft(tx, payslip, member);
  return null;
}

/** 저장된 줄. mergeLines는 줄을 펼쳐 복사하므로 id가 결과까지 따라온다 */
export type StoredLineDraft = PayslipLineDto;

export const toLineDraft = (line: PayslipLine): StoredLineDraft => ({
  id: line.id,
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
export async function previousSentLines(tx: Prisma.TransactionClient, membershipId: string, periodStart: string): Promise<LineDraft[]> {
  const previous = await tx.payslip.findFirst({
    where: { membershipId, status: { in: ['SENT', 'SUPERSEDED'] }, periodStart: { lt: toDateColumn(periodStart) } },
    orderBy: [{ periodStart: 'desc' }, { version: 'desc' }],
    include: { lines: true },
  });
  return previous?.lines.map(toLineDraft) ?? [];
}

/** 줄 짝짓기 키. 계산·수기 공제 줄은 (kind, code), CUSTOM은 줄 id */
const lineKey = (line: LineDraft) =>
  line.code === CUSTOM_CODE ? `id:${(line as Partial<StoredLineDraft>).id ?? ''}` : `${line.kind}:${line.code}`;

/** adjustReason은 사장님 줄 수정·공제 방식 전환에서만 바뀐다 (동기화 merge는 건드리지 않는다) */
const WRITABLE_FIELDS = ['calculatedAmount', 'amount', 'basis', 'sortOrder', 'adjustReason'] as const;

/** 달라진 쓰기 가능 필드만. 동기화에서 CUSTOM·수기 공제는 merge가 sortOrder만 바꾸므로 sortOrder만 나온다 */
const changedFields = (stored: LineDraft, next: LineDraft): Prisma.PayslipLineUpdateInput =>
  Object.fromEntries(WRITABLE_FIELDS.filter((field) => stored[field] !== next[field]).map((field) => [field, next[field]]));

export interface LineWrites {
  updates: { id: string; data: Prisma.PayslipLineUpdateInput }[];
  creates: LineDraft[];
  deleteIds: string[];
}

/**
 * 저장된 줄 → merge 결과로 가는 최소 쓰기 (§4.3). 동기화에서 삭제는 공제 방식이 바뀌어 빠진 공제 줄뿐이고,
 * 사장님 수정(§4.2)에서는 지운 CUSTOM 줄도 빠진다. id 없는 CUSTOM 줄은 새로 만든다.
 */
export function planLineWrites(stored: readonly StoredLineDraft[], merged: readonly LineDraft[]): LineWrites {
  const storedByKey = new Map(stored.map((line) => [lineKey(line), line]));
  const mergedKeys = new Set(merged.map(lineKey));
  const updates: LineWrites['updates'] = [];
  const creates: LineDraft[] = [];
  for (const line of merged) {
    const previous = storedByKey.get(lineKey(line));
    if (!previous) creates.push(line);
    else if (Object.keys(changedFields(previous, line)).length > 0) updates.push({ id: previous.id, data: changedFields(previous, line) });
  }
  const deleteIds = stored.filter((line) => !mergedKeys.has(lineKey(line))).map((line) => line.id);
  return { updates, creates, deleteIds };
}

const toLineRow = ({ kind, code, label, basis, calculatedAmount, amount, adjustReason, sortOrder }: LineDraft) => ({
  kind,
  code,
  label,
  basis,
  calculatedAmount,
  amount,
  adjustReason,
  sortOrder,
});

export async function applyLineWrites(tx: Prisma.TransactionClient, payslipId: string, writes: LineWrites): Promise<void> {
  if (writes.deleteIds.length > 0) await tx.payslipLine.deleteMany({ where: { id: { in: writes.deleteIds } } });
  for (const { id, data } of writes.updates) await tx.payslipLine.update({ where: { id }, data });
  if (writes.creates.length > 0) {
    await tx.payslipLine.createMany({ data: writes.creates.map((line) => ({ payslipId, ...toLineRow(line) })) });
  }
}

/**
 * 지급일이 비어 있는 DRAFT에 매장 payDay로 채울 값 (§3.4). 출시 직후엔 payDay 없이 초안이 생기므로
 * 사장님이 나중에 지급일을 정하면 다음 동기화에서 채운다. 사장님이 넣은 값·payDay 없음이면 빈 객체
 */
const payDateBackfill = (draft: Payslip, context: SyncContext): { payDate?: Date } => {
  if (draft.payDate !== null) return {};
  const payDate = payDateFor(context.period.end, context.payDay);
  return payDate ? { payDate: toDateColumn(payDate) } : {};
};

/** 최신이 DRAFT: 계산 줄은 제자리에서 고치고 CUSTOM·수기 공제·조정 금액은 그대로 둔다. 빈 지급일은 채운다 (§3.4·§4.3) */
async function refreshDraft(
  tx: Prisma.TransactionClient,
  context: SyncContext,
  { draft, member }: { draft: PayslipWithLines; member: PayrollMemberDto },
): Promise<SyncOutcome> {
  const lines = remerge(draft, member);
  const snapshot = snapshotOf(member, lines);
  const backfill = payDateBackfill(draft, context);
  const writes = planLineWrites(draft.lines.map(toLineDraft), lines);
  const linesUnchanged = writes.updates.length + writes.creates.length + writes.deleteIds.length === 0;
  const snapshotUnchanged = Object.entries(snapshot).every(([key, value]) => draft[key as keyof typeof snapshot] === value);
  if (linesUnchanged && snapshotUnchanged && !backfill.payDate) return null;
  await applyLineWrites(tx, draft.id, writes);
  await tx.payslip.update({ where: { id: draft.id }, data: { ...snapshot, ...backfill } });
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
      lines: { createMany: { data: input.lines.map(toLineRow) } },
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

/** 배치용: 실패는 로그만 남기고 다음 배치에서 다시 본다. 사장님 목록 조회 경로는 그대로 던진다 */
async function syncPeriodPayslipsSafely(
  db: PrismaClient,
  input: SyncPeriodInput,
): Promise<{ created: number; updated: number } | null> {
  try {
    return await syncPeriodPayslips(db, input);
  } catch (error) {
    console.error('[payslip] 명세서 동기화 실패, 다음 배치에서 다시', input.storeId, input.periodStart, error);
    return null;
  }
}

/**
 * 일배치 payslip-drafts (매일 06:10): ACTIVE 매장마다 끝난 최근 3기간을 동기화. 매장·기간별로 실패를 격리한다 (§4.3).
 * v1은 가장 최근 끝난 기간에만 만든다. 그 전 두 기간은 이미 있는 명세서만 갱신·정정한다
 * (기능 배포 전에 이미 지급한 기간에 초안이 쌓이지 않게).
 */
export async function runPayslipDraftJob(
  db: PrismaClient,
  now: Date,
): Promise<{ stores: number; created: number; updated: number; failed: number }> {
  const stores = await db.store.findMany({ where: { status: 'ACTIVE' } });
  const today = toLocalDate(now);
  const totals = { stores: stores.length, created: 0, updated: 0, failed: 0 };
  for (const store of stores) {
    for (const [index, periodStart] of endedPeriodStarts(store, today).entries()) {
      const result = await syncPeriodPayslipsSafely(db, { storeId: store.id, periodStart, now, createFirst: index === 0 });
      if (!result) totals.failed += 1;
      totals.created += result?.created ?? 0;
      totals.updated += result?.updated ?? 0;
    }
  }
  return totals;
}
