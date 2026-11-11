/**
 * 임금명세서 목록·상세 조회. 정본: docs/specs/payslip §5.1·§5.2·§7
 * 조회 권한: Owner·`PAYROLL_READ` Manager, 본인은 보낸 명세서(SENT·SUPERSEDED)만 (인덱스 §2.5).
 */

import type { DbClient, DeductionType, Membership, Payslip, PayslipLine, PayslipStatus, PrismaClient } from '@chulgeunkok/db';

import { payPeriodConfigOf, type PeriodWithNav } from '@/features/payroll/model/work-time';
import { resolvePeriod } from '@/features/payroll/server/period-attendances';
import { canAccessStore } from '@/server/auth/access';
import { requireMembership } from '@/server/auth/require-membership';
import { ApiError } from '@/server/http/api-error';

import { syncPeriodPayslips, toDateColumn, toLineDraft, type StoredLineDraft } from './payslip-sync-service';

export interface PayslipListItemDto {
  payslipId: string;
  memberId: string;
  name: string;
  version: number;
  status: PayslipStatus;
  netPay: number;
  /** 직원이 한 번이라도 열었는지 */
  viewed: boolean;
  /** 직원 기기에 푸시 토큰이 하나라도 있는지. 없으면 "알림 미수신" 배지 (§5.1) */
  pushEnabled: boolean;
  /** version 2 이상 (정정본) */
  isCorrection: boolean;
}

export interface PayslipListDto {
  period: PeriodWithNav;
  /** draft = 확인 필요(v1 DRAFT), sent = 보냄, correction = 정정본 확인 필요 (§5.1) */
  counts: { draft: number; sent: number; correction: number };
  items: PayslipListItemDto[];
}

export interface PayslipDetailDto {
  id: string;
  storeId: string;
  membershipId: string;
  periodStart: string;
  /** 미포함 */
  periodEnd: string;
  version: number;
  status: PayslipStatus;
  payDate: string | null;
  employeeName: string;
  employeeNumber: number;
  workDays: number;
  recognizedSeconds: number;
  overtimeSeconds: number;
  nightSeconds: number;
  holidaySeconds: number;
  deductionType: DeductionType;
  grossPay: number;
  totalDeduction: number;
  netPay: number;
  correctionNote: string | null;
  sentAt: string | null;
  viewedAt: string | null;
  lines: StoredLineDraft[];
  /** 정정본이면 같은 기간 직전 보낸 본 (그 안의 previousSent는 null) */
  previousSent: PayslipDetailDto | null;
}

type PayslipWithLines = Payslip & { lines: PayslipLine[] };

const toIsoDate = (date: Date) => date.toISOString().slice(0, 10);
const LINE_ORDER = [{ kind: 'asc' as const }, { sortOrder: 'asc' as const }];

/** GET /stores/:storeId/payslips — §7. 끝난 기간이면 먼저 동기화해 초안·정정본을 맞춘다 (§4.3) */
export async function listStorePayslips(
  db: PrismaClient,
  input: { storeId: string; actorUserId: string; periodStart?: string; now: Date },
): Promise<PayslipListDto> {
  await requireMembership({ storeId: input.storeId, userId: input.actorUserId, action: 'PAYROLL' }, db);
  const store = await db.store.findUniqueOrThrow({ where: { id: input.storeId } });
  const period = resolvePeriod({ periodStart: input.periodStart, payPeriod: payPeriodConfigOf(store), now: input.now });
  await syncPeriodPayslips(db, { storeId: input.storeId, periodStart: period.start, now: input.now });

  const payslips = await db.payslip.findMany({
    where: { storeId: input.storeId, periodStart: toDateColumn(period.start) },
    orderBy: { version: 'desc' },
    include: { membership: { include: { user: { select: { _count: { select: { pushTokens: true } } } } } } },
  });
  const latestByMember = new Map<string, (typeof payslips)[number]>();
  for (const payslip of payslips) if (!latestByMember.has(payslip.membershipId)) latestByMember.set(payslip.membershipId, payslip);

  const items = [...latestByMember.values()]
    .map((payslip) => toListItem(payslip, payslip.membership.user._count.pushTokens > 0))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  return { period, counts: countsOf(items), items };
}

const toListItem = (payslip: Payslip, pushEnabled: boolean): PayslipListItemDto => ({
  payslipId: payslip.id,
  memberId: payslip.membershipId,
  name: payslip.employeeName,
  version: payslip.version,
  status: payslip.status,
  netPay: payslip.netPay,
  viewed: payslip.viewedAt !== null,
  pushEnabled,
  isCorrection: payslip.version > 1,
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
    include: { membership: true, lines: { orderBy: LINE_ORDER } },
  });
  if (!payslip) throw new ApiError('NOT_FOUND');
  await assertCanRead(db, { payslip, membership: payslip.membership, actorUserId: input.actorUserId });
  return { ...toDetailDto(payslip), previousSent: await findPreviousSent(db, payslip) };
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
  const canReadStore = membership.status === 'ACTIVE' && canAccessStore(membership, 'PAYROLL');
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
    include: { lines: { orderBy: LINE_ORDER } },
  });
  return previous ? { ...toDetailDto(previous), previousSent: null } : null;
}

function toDetailDto(payslip: PayslipWithLines): Omit<PayslipDetailDto, 'previousSent'> {
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
