import type { Attendance, AttendanceStatus, Prisma, PrismaClient } from '@chulgeunkok/db';

import { evaluateAttendanceReviewsSafely } from '@/features/labor/server/work-record-review-service';
import { getPayPeriod, toLocalDate } from '@/features/payroll/model/work-time';
import { loadPeriodAttendances, resolvePeriod, type PeriodAttendanceRow } from '@/features/payroll/server/period-attendances';
import { requireMembership } from '@/server/auth/require-membership';
import { ApiError } from '@/server/http/api-error';

import type {
  AttendanceDetailDto,
  AttendanceListDto,
  AttendanceRowDto,
  AttendanceSnapshot,
} from '../model/attendance-admin-types';

import { toCorrectionDto } from './correction-dto';
import { findEffectiveTerms } from './punch-context';

/** 근무 한 건의 최대 길이 (docs/specs/attendance §7.1) */
const MAX_ATTENDANCE_MS = 24 * 60 * 60 * 1000;

export interface AdminAttendanceChange {
  clockInAt?: string;
  clockOutAt?: string | null;
  breakWaived?: boolean;
  status?: 'VOID';
  reason: string;
}

/** GET /stores/:storeId/attendances — 정산 기간 단위. docs/specs/attendance §8 */
export async function listStoreAttendances(
  db: PrismaClient,
  input: {
    storeId: string;
    actorUserId: string;
    periodStart?: string;
    memberId?: string;
    status?: AttendanceStatus;
    now: Date;
  },
): Promise<AttendanceListDto> {
  await requireMembership({ storeId: input.storeId, userId: input.actorUserId, action: 'ATTENDANCE_ADMIN' }, db);
  const store = await db.store.findUniqueOrThrow({ where: { id: input.storeId } });
  const period = resolvePeriod({ periodStart: input.periodStart, payPeriodStartDay: store.payPeriodStartDay, now: input.now });
  const rows = await loadPeriodAttendances(db, { storeId: input.storeId, period, memberId: input.memberId });
  return {
    period,
    rows: rows.filter((row) => !input.status || row.attendance.status === input.status).map(toRowDto),
  };
}

/** GET /attendances/:id — 관리자 상세 + 변경 이력 */
export async function getAttendanceDetail(
  db: PrismaClient,
  input: { attendanceId: string; actorUserId: string; now: Date },
): Promise<AttendanceDetailDto> {
  const attendance = await db.attendance.findUnique({ where: { id: input.attendanceId } });
  if (!attendance) throw new ApiError('NOT_FOUND');
  const actor = await requireMembership(
    { storeId: attendance.storeId, userId: input.actorUserId, action: 'MEMBER' },
    db,
  );
  // 직원은 자기 기록만 (docs/specs/attendance §9)
  if (actor.role === 'EMPLOYEE' && attendance.membershipId !== actor.id) throw new ApiError('FORBIDDEN');

  const store = await db.store.findUniqueOrThrow({ where: { id: attendance.storeId } });
  const period = getPayPeriod(toLocalDate(attendance.clockInAt), store.payPeriodStartDay);
  const [row] = (await loadPeriodAttendances(db, { storeId: attendance.storeId, period, memberId: attendance.membershipId }))
    .filter((candidate) => candidate.attendance.id === attendance.id);
  if (!row) throw new ApiError('NOT_FOUND');

  const [revisions, corrections] = await Promise.all([
    db.attendanceRevision.findMany({
      where: { attendanceId: attendance.id },
      include: { actor: true },
      orderBy: { createdAt: 'desc' },
    }),
    db.correctionRequest.findMany({
      where: { attendanceId: attendance.id },
      include: { requester: true, attendance: { include: { membership: { include: { user: true } } } } },
      orderBy: { createdAt: 'desc' },
    }),
  ]);
  return {
    ...toRowDto(row),
    corrections: corrections.map(toCorrectionDto),
    revisions: revisions.map((revision) => ({
      id: revision.id,
      actorName: revision.actor.name,
      reason: revision.reason,
      before: (revision.before as AttendanceSnapshot | null) ?? null,
      after: revision.after as unknown as AttendanceSnapshot,
      createdAt: revision.createdAt.toISOString(),
    })),
  };
}

/**
 * PATCH /attendances/:id — 관리자 직접 수정. 사유 필수, 모든 변경은 AttendanceRevision에 남는다 (docs/specs/attendance §7.4)
 * - 퇴근 시각을 넣으면 CLOSED (퇴근 누락 처리)
 * - 출근 시각이 다른 근로조건 기간으로 가면 그 버전으로 다시 잇는다 (시급 일관성)
 */
export async function updateAttendanceByAdmin(
  db: PrismaClient,
  input: { attendanceId: string; actorUserId: string; change: AdminAttendanceChange; now: Date },
): Promise<AttendanceDetailDto> {
  const current = await db.attendance.findUnique({ where: { id: input.attendanceId } });
  if (!current) throw new ApiError('NOT_FOUND');
  await requireMembership({ storeId: current.storeId, userId: input.actorUserId, action: 'ATTENDANCE_ADMIN' }, db);
  if (current.status === 'VOID') throw new ApiError('ATTENDANCE_NOT_EDITABLE');

  await db.$transaction((tx) =>
    applyAttendanceChange(tx, { current, change: input.change, actorUserId: input.actorUserId, now: input.now }),
  );
  await evaluateAttendanceReviewsSafely(db, { attendanceId: current.id, now: input.now });
  return getAttendanceDetail(db, input);
}

/**
 * 근태 변경 적용 + 변경 이력. 관리자 직접 수정과 수정 요청 승인이 같은 규칙을 쓴다.
 * 호출부 트랜잭션 안에서 부른다.
 */
export async function applyAttendanceChange(
  tx: Prisma.TransactionClient,
  input: {
    current: Attendance;
    change: AdminAttendanceChange;
    actorUserId: string;
    now: Date;
    correctionRequestId?: string;
  },
) {
  const next = await buildNextState(tx, { current: input.current, change: input.change, now: input.now });
  await tx.attendance.update({ where: { id: input.current.id }, data: next });
  await tx.attendanceRevision.create({
    data: {
      attendanceId: input.current.id,
      actorId: input.actorUserId,
      reason: input.change.reason,
      before: snapshot(input.current),
      after: snapshot({ ...input.current, ...next }),
      correctionRequestId: input.correctionRequestId,
    },
  });
}

async function buildNextState(
  tx: Prisma.TransactionClient,
  input: { current: Attendance; change: AdminAttendanceChange; now: Date },
) {
  const { current, change } = input;
  if (change.status === 'VOID') return { status: 'VOID' as const };

  const clockInAt = change.clockInAt ? new Date(change.clockInAt) : current.clockInAt;
  const clockOutAt = resolveClockOut(current.clockOutAt, change.clockOutAt);
  if (clockOutAt === null && current.status !== 'OPEN') {
    throw new ApiError('VALIDATION_FAILED', { message: '퇴근 시각을 입력해 주세요.' });
  }
  if (clockOutAt) assertValidRange({ clockInAt, clockOutAt, now: input.now });
  await assertNoOverlap(tx, { current, clockInAt, clockOutAt });

  const terms = await findEffectiveTerms(tx, { membershipId: current.membershipId, at: clockInAt });
  if (!terms) throw new ApiError('TERMS_NOT_SET');
  return {
    clockInAt,
    clockOutAt,
    termsId: terms.id,
    breakWaived: change.breakWaived ?? current.breakWaived,
    status: (clockOutAt ? 'CLOSED' : current.status) as AttendanceStatus,
  };
}

/** undefined: 그대로 / null: 비움 / 문자열: 새 시각 */
function resolveClockOut(current: Date | null, change: string | null | undefined): Date | null {
  if (change === undefined) return current;
  return change === null ? null : new Date(change);
}

function assertValidRange(input: { clockInAt: Date; clockOutAt: Date; now: Date }) {
  if (input.clockOutAt <= input.clockInAt) {
    throw new ApiError('VALIDATION_FAILED', { message: '퇴근 시각이 출근 시각보다 늦어야 해요.' });
  }
  if (input.clockOutAt.getTime() - input.clockInAt.getTime() > MAX_ATTENDANCE_MS) {
    throw new ApiError('VALIDATION_FAILED', { message: '한 번의 근무는 24시간을 넘을 수 없어요.' });
  }
  if (input.clockOutAt > input.now) {
    throw new ApiError('VALIDATION_FAILED', { message: '아직 오지 않은 시각으로는 바꿀 수 없어요.' });
  }
}

/**
 * 같은 직원의 다른 근무(무효 제외)와 시간이 겹치면 ATTENDANCE_CONFLICT.
 * 퇴근 시각이 없는 기록 중 실제 근무 중(OPEN)만 "끝나지 않음"으로 본다. 퇴근 누락은 끝 시각을 모르므로 막지 않는다
 */
async function assertNoOverlap(
  tx: Prisma.TransactionClient,
  input: { current: Attendance; clockInAt: Date; clockOutAt: Date | null },
) {
  const overlapping = await tx.attendance.findFirst({
    where: {
      id: { not: input.current.id },
      membershipId: input.current.membershipId,
      status: { not: 'VOID' },
      ...(input.clockOutAt ? { clockInAt: { lt: input.clockOutAt } } : {}),
      OR: [{ clockOutAt: null, status: 'OPEN' }, { clockOutAt: { gt: input.clockInAt } }],
    },
  });
  if (overlapping) throw new ApiError('ATTENDANCE_CONFLICT');
}

function snapshot(attendance: Pick<Attendance, 'clockInAt' | 'clockOutAt' | 'status' | 'breakWaived'>) {
  return {
    clockInAt: attendance.clockInAt.toISOString(),
    clockOutAt: attendance.clockOutAt?.toISOString() ?? null,
    status: attendance.status,
    breakWaived: attendance.breakWaived,
  };
}

export function toRowDto(row: PeriodAttendanceRow): AttendanceRowDto {
  const sum = (key: 'workedSeconds' | 'breakSeconds' | 'recognizedSeconds') =>
    row.segments.reduce((total, segment) => total + segment[key], 0);
  const { attendance } = row;
  return {
    id: attendance.id,
    memberId: attendance.membershipId,
    name: attendance.membership.user.name,
    localDate: row.localDate,
    clockInAt: attendance.clockInAt.toISOString(),
    clockOutAt: attendance.clockOutAt?.toISOString() ?? null,
    status: attendance.status,
    outsideArea: attendance.clockInOutsideArea,
    breakWaived: attendance.breakWaived,
    revised: attendance._count.revisions > 0,
    workedSeconds: sum('workedSeconds'),
    breakSeconds: sum('breakSeconds'),
    recognizedSeconds: sum('recognizedSeconds'),
    breakNotScheduled: row.breakNotScheduled,
  };
}
