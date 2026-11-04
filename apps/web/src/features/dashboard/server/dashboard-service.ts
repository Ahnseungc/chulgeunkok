import type { Membership, PrismaClient } from '@chulgeunkok/db';

import { findHeadcountBand } from '@/features/labor/server/labor-context';
import { OPEN_REVIEW_STATUSES } from '@/features/labor/server/review-service';
import { reviewPresentation } from '@/features/labor/model/review-copy';
import { getPayPeriod, localMidnight, localWeekday, summarizePeriod, toLocalDate, toSegments } from '@/features/payroll/model/work-time';
import { canAccessStore } from '@/server/auth/access';
import { requireMembership } from '@/server/auth/require-membership';

import type { DashboardDto } from '../model/dashboard-types';

const MINUTE_MS = 60_000;
/** 기간 시작 직전에 출근해 자정을 넘긴 근무도 포함하려고 하루 앞부터 읽는다 */
const DAY_MS = 24 * 60 * 60 * 1000;

/** GET /stores/:storeId/dashboard — docs/specs/dashboard §3·§5 */
export async function getDashboard(
  db: PrismaClient,
  input: { storeId: string; actorUserId: string; now: Date },
): Promise<DashboardDto> {
  const actor = await requireMembership({ storeId: input.storeId, userId: input.actorUserId, action: 'DASHBOARD' }, db);
  const store = await db.store.findUniqueOrThrow({ where: { id: input.storeId } });
  const today = toLocalDate(input.now);

  const [working, todayStatus, todo, currentPeriod] = await Promise.all([
    findWorking(db, input.storeId),
    findTodayStatus(db, { storeId: input.storeId, today, now: input.now }),
    countTodo(db, { actor, now: input.now, today }),
    summarizeCurrentPeriod(db, { storeId: input.storeId, today, payPeriodStartDay: store.payPeriodStartDay }),
  ]);

  return {
    serverNow: input.now.toISOString(),
    store: { id: store.id, name: store.name },
    working,
    today: todayStatus,
    todo,
    currentPeriod: {
      ...currentPeriod,
      basePayEstimate: canAccessStore(actor, 'PAYROLL') ? currentPeriod.basePayEstimate : null,
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
  const [termsMissing, missingClockOut, pendingCorrections, pendingInvitations] = await Promise.all([
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
  ]);
  return {
    termsMissing,
    missingClockOut,
    pendingCorrections,
    laborReviews: canAccessStore(input.actor, 'LABOR_REVIEW') ? await countSheetReviews(db, { ...input, storeId }) : null,
    pendingInvitations,
  };
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

/** 이번 정산 기간 합계. 정산 화면과 같은 함수로 계산한다 (docs/specs/dashboard §5) */
async function summarizeCurrentPeriod(
  db: PrismaClient,
  input: { storeId: string; today: string; payPeriodStartDay: number },
) {
  const period = getPayPeriod(input.today, input.payPeriodStartDay);
  const closed = await db.attendance.findMany({
    where: {
      storeId: input.storeId,
      status: 'CLOSED',
      clockInAt: {
        gte: new Date(localMidnight(period.start).getTime() - DAY_MS),
        lt: localMidnight(period.end),
      },
    },
    include: { terms: { include: { schedules: true } } },
  });
  const segments = closed.flatMap((attendance) =>
    attendance.clockOutAt
      ? toSegments({ attendance: { ...attendance, clockOutAt: attendance.clockOutAt }, terms: attendance.terms }).segments
      : [],
  );
  const summary = summarizePeriod(segments, period);
  return { start: period.start, end: period.end, recognizedSeconds: summary.recognizedSeconds, basePayEstimate: summary.basePayEstimate };
}
