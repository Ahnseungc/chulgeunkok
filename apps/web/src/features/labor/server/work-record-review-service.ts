import { Prisma, type LaborReviewType, type PrismaClient } from '@chulgeunkok/db';

import { localMidnight, toLocalDate, toSegments } from '@/features/payroll/model/work-time';

import { FULL_TIME_WEEKLY_MINUTES, dailyLaborMinutes, weeklyContractMinutes } from '../model/labor-rules';
import {
  isRecordedBreakShort,
  nightWorkMinutes,
  overtimeReason,
  weekdayOfLocalDate,
  weekStartOf,
} from '../model/work-record-rules';

import { findRuleSet } from './labor-context';
import { OPEN_REVIEW_STATUSES } from './review-service';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_DAYS = 7;
/** 일배치가 다시 평가하는 최근 퇴근 범위 (퇴근 직후 평가가 실패했을 때의 안전망) */
const REEVALUATE_RECENT_MS = 2 * DAY_MS;

const addDays = (localDate: string, days: number) =>
  new Date(Date.parse(`${localDate}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

const ATTENDANCE_REVIEW_TYPES: LaborReviewType[] = ['NIGHT_WORK', 'OVERTIME', 'BREAK_SHORTAGE'];
const ATTENDANCE_INCLUDE = { terms: { include: { schedules: true } }, breaks: true } as const;

/**
 * 근무 기록 하나의 야간·연장·휴게 부족 안내를 만들거나 해소한다 (docs/specs/labor §5).
 * 퇴근 확정·근태 수정·요청 승인 뒤에 부른다. 같은 근무·같은 규칙 버전은 한 번만 만든다.
 */
export async function evaluateAttendanceReviews(db: PrismaClient, input: { attendanceId: string; now: Date }) {
  const attendance = await db.attendance.findUniqueOrThrow({
    where: { id: input.attendanceId },
    include: ATTENDANCE_INCLUDE,
  });
  const source = { membershipId: attendance.membershipId, sourceId: attendance.id };
  if (attendance.status !== 'CLOSED' || !attendance.clockOutAt) {
    await resolveReviews(db, { ...source, types: ATTENDANCE_REVIEW_TYPES });
    return;
  }
  const rule = await findRuleSet(db, toLocalDate(input.now));
  const localDate = toLocalDate(attendance.clockInAt);

  const night = nightWorkMinutes(attendance.clockInAt, attendance.clockOutAt) > 0;
  await (night
    ? upsertReview(db, { ...source, type: 'NIGHT_WORK', reasonCode: `NIGHT:${localDate}`, ruleVersion: rule.version })
    : resolveReviews(db, { ...source, types: ['NIGHT_WORK'] }));

  const closed = { ...attendance, clockOutAt: attendance.clockOutAt };
  const overtime = await findOvertime(db, { attendance: closed });
  await (overtime
    ? upsertReview(db, { ...source, type: 'OVERTIME', reasonCode: `${overtime.reasonCode}:${overtime.localDate}`, ruleVersion: rule.version })
    : resolveReviews(db, { ...source, types: ['OVERTIME'] }));

  await (hasShortRecordedBreak(closed)
    ? upsertReview(db, { ...source, type: 'BREAK_SHORTAGE', reasonCode: `RECORDED:${localDate}`, ruleVersion: rule.version })
    : resolveReviews(db, { ...source, types: ['BREAK_SHORTAGE'] }));
}

/** 직원이 휴게를 남긴 근무만 실제 기록으로 판단한다. 없으면 근로조건 검토(§4)가 맡는다 */
function hasShortRecordedBreak(attendance: EvaluatedAttendance): boolean {
  if (attendance.breaks.length === 0) return false;
  const { segments } = toSegments({ attendance, terms: attendance.terms });
  return isRecordedBreakShort({
    workedSeconds: segments.reduce((sum, segment) => sum + segment.workedSeconds, 0),
    breakSeconds: segments.reduce((sum, segment) => sum + segment.breakSeconds, 0),
  });
}

/** 퇴근·수정 응답을 막지 않도록 실패는 기록만 한다. 일배치가 다시 평가한다 (docs/specs/attendance §3.3-9) */
export async function evaluateAttendanceReviewsSafely(db: PrismaClient, input: { attendanceId: string; now: Date }) {
  try {
    await evaluateAttendanceReviews(db, input);
  } catch (error) {
    console.error('[labor] 근무 기록 검토 실패, 일배치에서 다시 평가', input.attendanceId, error);
  }
}

type EvaluatedAttendance = Prisma.AttendanceGetPayload<{ include: typeof ATTENDANCE_INCLUDE }> & {
  clockOutAt: Date;
};

/** 같은 직원의 그 주 정상 근무를 모아 날짜·주 합계로 판단한다 */
async function findOvertime(db: PrismaClient, input: { attendance: EvaluatedAttendance }) {
  const { attendance } = input;
  const weekStart = weekStartOf(toLocalDate(attendance.clockInAt));
  const weekEnd = addDays(weekStart, WEEK_DAYS);
  const weekAttendances = await db.attendance.findMany({
    where: {
      membershipId: attendance.membershipId,
      status: 'CLOSED',
      clockInAt: { gte: new Date(localMidnight(weekStart).getTime() - DAY_MS), lt: localMidnight(weekEnd) },
    },
    include: ATTENDANCE_INCLUDE,
  });
  const segments = weekAttendances.flatMap((row) =>
    row.clockOutAt ? toSegments({ attendance: { ...row, clockOutAt: row.clockOutAt }, terms: row.terms }).segments : [],
  );
  const dayRecognizedSeconds = new Map<string, number>();
  for (const segment of segments) {
    dayRecognizedSeconds.set(segment.localDate, (dayRecognizedSeconds.get(segment.localDate) ?? 0) + segment.recognizedSeconds);
  }
  const weekly = weeklyContractMinutes(attendance.terms);
  return overtimeReason({
    isShortTime: weekly > 0 && weekly < FULL_TIME_WEEKLY_MINUTES,
    dates: [...new Set(segments.filter((segment) => segment.attendanceId === attendance.id).map((segment) => segment.localDate))],
    dayRecognizedSeconds,
    weekRecognizedSeconds: segments
      .filter((segment) => segment.localDate >= weekStart && segment.localDate < weekEnd)
      .reduce((sum, segment) => sum + segment.recognizedSeconds, 0),
    scheduledLaborMinutes: (localDate) => {
      const schedule = attendance.terms.schedules.find((candidate) => candidate.weekday === weekdayOfLocalDate(localDate));
      return schedule ? dailyLaborMinutes(schedule) : 0;
    },
  });
}

/**
 * 매일 1회 (06:00 권장): 어제 결근 의심 + 최근 퇴근 재평가 (docs/specs/labor §5).
 * 결근 의심 = 어제가 소정 근무 요일인데 출근 기록이 없음 (계약기간 안, 주마다 다름 제외)
 */
export async function runDailyReviewJob(db: PrismaClient, now: Date): Promise<{ absences: number; reevaluated: number }> {
  const yesterday = addDays(toLocalDate(now), -1);
  const absences = await createAbsenceReviews(db, { localDate: yesterday, now });
  const recent = await db.attendance.findMany({
    where: { status: 'CLOSED', clockOutAt: { gte: new Date(now.getTime() - REEVALUATE_RECENT_MS) } },
    select: { id: true },
  });
  for (const attendance of recent) await evaluateAttendanceReviewsSafely(db, { attendanceId: attendance.id, now });
  return { absences, reevaluated: recent.length };
}

async function createAbsenceReviews(db: PrismaClient, input: { localDate: string; now: Date }): Promise<number> {
  const dayStart = localMidnight(input.localDate);
  const dayEnd = localMidnight(addDays(input.localDate, 1));
  const dateColumn = new Date(`${input.localDate}T00:00:00Z`);
  const weekday = weekdayOfLocalDate(input.localDate);
  const rule = await findRuleSet(db, toLocalDate(input.now));
  const members = await db.membership.findMany({
    where: { status: 'ACTIVE', role: { not: 'OWNER' } },
    include: {
      employmentTerms: {
        where: {
          effectiveFrom: { lt: dayEnd },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: dayStart } }],
          scheduleVaries: false,
          contractStartDate: { lte: dateColumn },
          AND: [{ OR: [{ contractEndDate: null }, { contractEndDate: { gte: dateColumn } }] }],
          schedules: { some: { weekday } },
        },
        select: { id: true },
      },
      attendances: { where: { clockInAt: { gte: dayStart, lt: dayEnd }, status: { not: 'VOID' } }, select: { id: true } },
    },
  });

  let created = 0;
  for (const member of members) {
    if (member.employmentTerms.length === 0 || member.attendances.length > 0) continue;
    try {
      await db.laborReview.create({
        data: {
          membershipId: member.id,
          type: 'ABSENCE_SUSPECTED',
          status: 'OPEN',
          reasonCode: `ABSENCE:${input.localDate}`,
          sourceType: 'PAY_PERIOD',
          sourceId: `${member.id}:${input.localDate}`,
          ruleVersion: rule.version,
        },
      });
      created += 1;
    } catch (error) {
      // 같은 날 이미 만든 안내 (배치 재실행)
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error;
    }
  }
  return created;
}

async function upsertReview(
  db: PrismaClient,
  input: { membershipId: string; sourceId: string; type: LaborReviewType; reasonCode: string; ruleVersion: string },
) {
  const where = {
    membershipId_type_sourceType_sourceId_ruleVersion: {
      membershipId: input.membershipId,
      type: input.type,
      sourceType: 'ATTENDANCE' as const,
      sourceId: input.sourceId,
      ruleVersion: input.ruleVersion,
    },
  };
  const existing = await db.laborReview.findUnique({ where });
  if (!existing) {
    await db.laborReview.create({ data: { ...where.membershipId_type_sourceType_sourceId_ruleVersion, reasonCode: input.reasonCode, status: 'OPEN' } });
    return;
  }
  // 확인한 안내는 그대로 둔다. 해소됐던 안내가 다시 해당하면 다시 연다
  if (existing.status === 'RESOLVED' || existing.reasonCode !== input.reasonCode) {
    await db.laborReview.update({
      where: { id: existing.id },
      data: { reasonCode: input.reasonCode, ...(existing.status === 'RESOLVED' ? { status: 'OPEN', seenAt: null } : {}) },
    });
  }
}

async function resolveReviews(
  db: PrismaClient,
  input: { membershipId: string; sourceId: string; types: LaborReviewType[] },
) {
  await db.laborReview.updateMany({
    where: {
      membershipId: input.membershipId,
      sourceType: 'ATTENDANCE',
      sourceId: input.sourceId,
      type: { in: input.types },
      status: { in: [...OPEN_REVIEW_STATUSES] },
    },
    data: { status: 'RESOLVED' },
  });
}
