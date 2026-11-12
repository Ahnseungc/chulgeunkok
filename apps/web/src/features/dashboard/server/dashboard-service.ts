import type { Membership, PrismaClient } from '@chulgeunkok/db';

import { findHeadcountBand } from '@/features/labor/server/labor-context';
import { OPEN_REVIEW_STATUSES } from '@/features/labor/server/review-service';
import { reviewPresentation } from '@/features/labor/model/review-copy';
import {
  getStorePayPeriod,
  localMidnight,
  localWeekday,
  payPeriodConfigOf,
  summarizePeriod,
  toLocalDate,
  type PayPeriodConfig,
} from '@/features/payroll/model/work-time';
import { loadPeriodWithAllowances } from '@/features/payroll/server/allowance-service';
import { loadHeadcountEstimate } from '@/features/store/server/headcount-estimate-service';
import { canAccessStore } from '@/server/auth/access';
import { canAccessVerified, requireMembership } from '@/server/auth/require-membership';

import type { DashboardDto } from '../model/dashboard-types';

const MINUTE_MS = 60_000;

/** GET /stores/:storeId/dashboard — docs/specs/dashboard §3·§5 */
export async function getDashboard(
  db: PrismaClient,
  input: { storeId: string; actorUserId: string; now: Date },
): Promise<DashboardDto> {
  const actor = await requireMembership({ storeId: input.storeId, userId: input.actorUserId, action: 'DASHBOARD' }, db);
  const store = await db.store.findUniqueOrThrow({ where: { id: input.storeId } });
  const today = toLocalDate(input.now);

  const [working, todayStatus, todo, currentPeriod, showPay] = await Promise.all([
    findWorking(db, input.storeId),
    findTodayStatus(db, { storeId: input.storeId, today, now: input.now }),
    countTodo(db, { actor, now: input.now, today }),
    summarizeCurrentPeriod(db, { storeId: input.storeId, today, payPeriod: payPeriodConfigOf(store) }),
    canAccessVerified(db, actor, 'PAYROLL'),
  ]);

  return {
    serverNow: input.now.toISOString(),
    store: { id: store.id, name: store.name },
    working,
    today: todayStatus,
    todo,
    currentPeriod: {
      ...currentPeriod,
      // 급여 권한 Manager가 휴대폰 인증 전이면 대시보드 전체를 막지 않고 금액만 숨긴다 (auth §4.2)
      basePayEstimate: showPay ? currentPeriod.basePayEstimate : null,
      allowanceEstimate: showPay ? currentPeriod.allowanceEstimate : null,
      phoneVerificationRequired: !showPay && canAccessStore(actor, 'PAYROLL'),
    },
  };
}

async function findWorking(db: PrismaClient, storeId: string): Promise<DashboardDto['working']> {
  const open = await db.attendance.findMany({
    where: { storeId, status: 'OPEN' },
    include: { membership: { include: { user: true } } },
    orderBy: { clockInAt: 'asc' },
  });
  return open.map((attendance) => ({
    attendanceId: attendance.id,
    memberId: attendance.membershipId,
    name: attendance.membership.user.name,
    clockInAt: attendance.clockInAt.toISOString(),
    outsideArea: attendance.clockInOutsideArea,
  }));
}

/**
 * 오늘 소정 근무자 = 오늘 요일 스케줄이 있는 재직 직원 ("주마다 달라요"는 알 수 없어 제외).
 * 아직 출근 전 = 소정 시작이 지났는데 오늘 출근 기록이 없는 사람.
 */
async function findTodayStatus(
  db: PrismaClient,
  input: { storeId: string; today: string; now: Date },
): Promise<DashboardDto['today']> {
  const dayStart = localMidnight(input.today);
  const weekday = localWeekday(input.now);
  const members = await db.membership.findMany({
    where: { storeId: input.storeId, status: 'ACTIVE' },
    include: {
      user: true,
      employmentTerms: {
        where: { effectiveFrom: { lte: input.now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: input.now } }] },
        include: { schedules: { where: { weekday } } },
      },
      attendances: { where: { clockInAt: { gte: dayStart } }, select: { id: true } },
    },
  });

  const scheduled = members.flatMap((member) => {
    const terms = member.employmentTerms[0];
    const schedule = terms && !terms.scheduleVaries ? terms.schedules[0] : undefined;
    if (!schedule) return [];
    return [{ member, scheduledStartAt: new Date(dayStart.getTime() + schedule.startMinute * MINUTE_MS) }];
  });
  return {
    clockedInCount: members.filter((member) => member.attendances.length > 0).length,
    scheduledCount: scheduled.length,
    notYetClockedIn: scheduled
      .filter(({ member, scheduledStartAt }) => member.attendances.length === 0 && scheduledStartAt <= input.now)
      .map(({ member, scheduledStartAt }) => ({
        memberId: member.id,
        name: member.user.name,
        scheduledStartAt: scheduledStartAt.toISOString(),
      })),
  };
}

async function countTodo(
  db: PrismaClient,
  input: { actor: Membership; now: Date; today: string },
): Promise<DashboardDto['todo']> {
  const storeId = input.actor.storeId;
  const [termsMissing, missingClockOut, pendingCorrections, pendingInvitations, headcountMismatch] = await Promise.all([
    db.membership.count({
      where: {
        storeId,
        status: 'ACTIVE',
        role: { not: 'OWNER' },
        employmentTerms: {
          none: { effectiveFrom: { lte: input.now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: input.now } }] },
        },
      },
    }),
    db.attendance.count({ where: { storeId, status: 'MISSING_CLOCK_OUT' } }),
    db.correctionRequest.count({ where: { status: 'PENDING', attendance: { storeId } } }),
    db.storeInvitation.count({
      where: { storeId, acceptedAt: null, revokedAt: null, expiresAt: { gt: input.now } },
    }),
    loadHeadcountMismatch(db, { actor: input.actor, now: input.now }),
  ]);
  return {
    termsMissing,
    missingClockOut,
    pendingCorrections,
    laborReviews: (await canAccessVerified(db, input.actor, 'LABOR_REVIEW')) ? await countSheetReviews(db, { ...input, storeId }) : null,
    pendingInvitations,
    ...(canAccessStore(input.actor, 'PAYSLIP_WRITE') ? await countPayslipDrafts(db, storeId) : NO_PAYSLIP_ACCESS),
    headcountMismatch,
  };
}

/** 규모 신고값과 출근 기록 추정치가 다른지. 사장님만 (docs/specs/store §6.4) */
async function loadHeadcountMismatch(db: PrismaClient, input: { actor: Membership; now: Date }) {
  if (input.actor.role !== 'OWNER') return null;
  return (await loadHeadcountEstimate(db, { storeId: input.actor.storeId, now: input.now }))?.mismatch ?? null;
}

const NO_PAYSLIP_ACCESS = { payslipDrafts: null, payslipDraftPeriodStart: null } as const;

/**
 * 보내기 전 명세서 수와 가장 오래된 DRAFT 기간 (docs/specs/payslip §5.1). 카드가 그 기간 목록을 연다.
 * 다음 동기화(목록 조회·일배치) 전까지 늦을 수 있다 (§4.3)
 */
async function countPayslipDrafts(db: PrismaClient, storeId: string) {
  const where = { storeId, status: 'DRAFT' as const };
  const [payslipDrafts, oldest] = await Promise.all([
    db.payslip.count({ where }),
    db.payslip.findFirst({ where, orderBy: { periodStart: 'asc' }, select: { periodStart: true } }),
  ]);
  return { payslipDrafts, payslipDraftPeriodStart: oldest?.periodStart.toISOString().slice(0, 10) ?? null };
}

/** 바텀시트로 띄울 안내만 센다. 5인 미만 배지·목록 전용 안내는 처리할 일이 아니다 (docs/specs/dashboard §4) */
async function countSheetReviews(db: PrismaClient, input: { storeId: string; today: string }) {
  const [reviews, band] = await Promise.all([
    db.laborReview.findMany({
      where: { membership: { storeId: input.storeId }, status: { in: [...OPEN_REVIEW_STATUSES] } },
      select: { type: true },
    }),
    findHeadcountBand(db, { storeId: input.storeId, localDate: input.today }),
  ]);
  return reviews.filter((review) => reviewPresentation(review.type, band) === 'SHEET').length;
}

/** 이번 정산 기간 합계. 정산 화면과 같은 함수로 계산한다 (docs/specs/dashboard §5, payroll §3.6) */
async function summarizeCurrentPeriod(
  db: PrismaClient,
  input: { storeId: string; today: string; payPeriod: PayPeriodConfig },
) {
  const period = getStorePayPeriod(input.today, input.payPeriod);
  const { rows, allowancesFor, memberIds } = await loadPeriodWithAllowances(db, { ...input, period });
  const summary = summarizePeriod(rows.flatMap((row) => row.segments), period);
  return {
    start: period.start,
    end: period.end,
    recognizedSeconds: summary.recognizedSeconds,
    basePayEstimate: summary.basePayEstimate,
    allowanceEstimate: memberIds.reduce((sum, memberId) => sum + allowancesFor(memberId).total, 0),
  };
}
