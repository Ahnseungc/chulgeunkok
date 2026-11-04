import { Prisma, type Attendance, type PrismaClient } from '@chulgeunkok/db';

import { evaluateAttendanceReviewsSafely } from '@/features/labor/server/work-record-review-service';
import { toLocalDate } from '@/features/payroll/model/work-time';
import { requireMembership } from '@/server/auth/require-membership';
import { ApiError } from '@/server/http/api-error';

import type { CorrectionDto, CorrectionStatus } from '../model/attendance-admin-types';

import { applyAttendanceChange, type AdminAttendanceChange } from './attendance-admin-service';
import { toCorrectionDto } from './correction-dto';

/** 근무일로부터 이 기간이 지나면 직원은 요청할 수 없다 (docs/specs/attendance §7.1) */
export const CORRECTION_WINDOW_DAYS = 35;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_ATTENDANCE_MS = 24 * 60 * 60 * 1000;

const WITH_ATTENDANCE = { attendance: { include: { membership: { include: { user: true } } } } } as const;

export type CreateCorrectionInput =
  | { type: 'TIME'; proposedClockInAt?: string; proposedClockOutAt?: string; reason: string }
  | { type: 'BREAK_WAIVED'; reason: string }
  | { type: 'MISSING_CLOCK_OUT'; proposedClockOutAt: string; reason: string };

/** POST /attendances/:id/correction-requests — 직원 본인 근태만 (docs/specs/attendance §7.1) */
export async function createCorrectionRequest(
  db: PrismaClient,
  input: { attendanceId: string; actorUserId: string; body: CreateCorrectionInput; now: Date },
): Promise<CorrectionDto> {
  const attendance = await db.attendance.findUnique({
    where: { id: input.attendanceId },
    include: { membership: true },
  });
  // 남의 근태는 존재 여부도 숨긴다
  if (!attendance || attendance.membership.userId !== input.actorUserId) throw new ApiError('NOT_FOUND');
  if (attendance.membership.status !== 'ACTIVE') throw new ApiError('NOT_STORE_MEMBER');
  assertRequestAllowed({ attendance, body: input.body, now: input.now });

  try {
    const created = await db.correctionRequest.create({
      data: {
        attendanceId: attendance.id,
        requesterId: input.actorUserId,
        type: input.body.type,
        proposedClockInAt: 'proposedClockInAt' in input.body && input.body.proposedClockInAt ? new Date(input.body.proposedClockInAt) : null,
        proposedClockOutAt: 'proposedClockOutAt' in input.body && input.body.proposedClockOutAt ? new Date(input.body.proposedClockOutAt) : null,
        reason: input.body.reason,
      },
      include: WITH_ATTENDANCE,
    });
    return toCorrectionDto(created);
  } catch (error) {
    // 근태당 대기 중 요청 1개 (부분 유니크)
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ApiError('CORRECTION_PENDING_EXISTS');
    }
    throw error;
  }
}

function assertRequestAllowed(input: { attendance: Attendance; body: CreateCorrectionInput; now: Date }) {
  const { attendance, body, now } = input;
  if (attendance.status === 'VOID') throw new ApiError('ATTENDANCE_NOT_EDITABLE');
  const windowStart = toLocalDate(new Date(now.getTime() - CORRECTION_WINDOW_DAYS * DAY_MS));
  if (toLocalDate(attendance.clockInAt) < windowStart) throw new ApiError('CORRECTION_WINDOW_CLOSED');

  if (body.type === 'MISSING_CLOCK_OUT' && attendance.status !== 'MISSING_CLOCK_OUT') {
    throw new ApiError('ATTENDANCE_NOT_EDITABLE');
  }
  if (body.type === 'BREAK_WAIVED' && (attendance.status !== 'CLOSED' || attendance.breakWaived)) {
    throw new ApiError('ATTENDANCE_NOT_EDITABLE');
  }
  if (body.type === 'BREAK_WAIVED') return;

  const clockInAt = body.type === 'TIME' && body.proposedClockInAt ? new Date(body.proposedClockInAt) : attendance.clockInAt;
  const proposedOut = body.proposedClockOutAt ? new Date(body.proposedClockOutAt) : attendance.clockOutAt;
  if (proposedOut) assertValidProposal({ clockInAt, clockOutAt: proposedOut, now });
}

function assertValidProposal(input: { clockInAt: Date; clockOutAt: Date; now: Date }) {
  const invalid =
    input.clockOutAt <= input.clockInAt ||
    input.clockOutAt > input.now ||
    input.clockOutAt.getTime() - input.clockInAt.getTime() > MAX_ATTENDANCE_MS;
  if (invalid) throw new ApiError('VALIDATION_FAILED', { message: '출퇴근 시각을 확인해 주세요.' });
}

/** POST /correction-requests/:id/cancel — 요청한 본인, 대기 중일 때만 */
export async function cancelCorrectionRequest(
  db: PrismaClient,
  input: { requestId: string; actorUserId: string; now: Date },
): Promise<CorrectionDto> {
  const request = await db.correctionRequest.findUnique({ where: { id: input.requestId } });
  if (!request || request.requesterId !== input.actorUserId) throw new ApiError('NOT_FOUND');
  if (request.status !== 'PENDING') throw new ApiError('ATTENDANCE_NOT_EDITABLE');
  return toCorrectionDto(
    await db.correctionRequest.update({
      where: { id: request.id },
      data: { status: 'CANCELED', decidedAt: input.now },
      include: WITH_ATTENDANCE,
    }),
  );
}

/** GET /stores/:storeId/correction-requests — 관리자 */
export async function listStoreCorrections(
  db: PrismaClient,
  input: { storeId: string; actorUserId: string; status: CorrectionStatus },
): Promise<CorrectionDto[]> {
  await requireMembership({ storeId: input.storeId, userId: input.actorUserId, action: 'ATTENDANCE_ADMIN' }, db);
  const requests = await db.correctionRequest.findMany({
    where: { status: input.status, attendance: { storeId: input.storeId } },
    include: WITH_ATTENDANCE,
    orderBy: { createdAt: input.status === 'PENDING' ? 'asc' : 'desc' },
  });
  return requests.map(toCorrectionDto);
}

/**
 * POST /correction-requests/:id/approve — 근태 반영 + 변경 이력 + 요청 APPROVED를 한 트랜잭션으로.
 * 관리자가 제안 시각을 고쳐서 승인할 수 있다 (docs/specs/attendance §7.3)
 */
export async function approveCorrectionRequest(
  db: PrismaClient,
  input: {
    requestId: string;
    actorUserId: string;
    override: { clockInAt?: string; clockOutAt?: string; decisionNote?: string };
    now: Date;
  },
): Promise<CorrectionDto> {
  const request = await loadPendingForAdmin(db, input);
  const updated = await db.$transaction(async (tx) => {
    const claimed = await tx.correctionRequest.updateMany({
      where: { id: request.id, status: 'PENDING' },
      data: { status: 'APPROVED', decidedById: input.actorUserId, decidedAt: input.now, decisionNote: input.override.decisionNote },
    });
    if (claimed.count === 0) throw new ApiError('ATTENDANCE_NOT_EDITABLE');
    await applyAttendanceChange(tx, {
      current: request.attendance,
      change: toAttendanceChange(request, input.override),
      actorUserId: input.actorUserId,
      now: input.now,
      correctionRequestId: request.id,
    });
    return tx.correctionRequest.findUniqueOrThrow({ where: { id: request.id }, include: WITH_ATTENDANCE });
  });
  await evaluateAttendanceReviewsSafely(db, { attendanceId: request.attendanceId, now: input.now });
  return toCorrectionDto(updated);
}

/** POST /correction-requests/:id/reject — 반려 사유 필수. 근태는 그대로 */
export async function rejectCorrectionRequest(
  db: PrismaClient,
  input: { requestId: string; actorUserId: string; decisionNote: string; now: Date },
): Promise<CorrectionDto> {
  const request = await loadPendingForAdmin(db, input);
  return toCorrectionDto(
    await db.correctionRequest.update({
      where: { id: request.id },
      data: { status: 'REJECTED', decidedById: input.actorUserId, decidedAt: input.now, decisionNote: input.decisionNote },
      include: WITH_ATTENDANCE,
    }),
  );
}

async function loadPendingForAdmin(db: PrismaClient, input: { requestId: string; actorUserId: string }) {
  const request = await db.correctionRequest.findUnique({ where: { id: input.requestId }, include: { attendance: true } });
  if (!request) throw new ApiError('NOT_FOUND');
  await requireMembership({ storeId: request.attendance.storeId, userId: input.actorUserId, action: 'ATTENDANCE_ADMIN' }, db);
  if (request.status !== 'PENDING') throw new ApiError('ATTENDANCE_NOT_EDITABLE');
  return request;
}

/** 요청 종류 → 근태 변경. 관리자가 고친 시각이 있으면 그걸 쓴다 */
function toAttendanceChange(
  request: { type: string; reason: string; proposedClockInAt: Date | null; proposedClockOutAt: Date | null },
  override: { clockInAt?: string; clockOutAt?: string; decisionNote?: string },
): AdminAttendanceChange {
  const reason = override.decisionNote ? `${request.reason} (승인 메모: ${override.decisionNote})` : request.reason;
  if (request.type === 'BREAK_WAIVED') return { breakWaived: true, reason };
  return {
    clockInAt: override.clockInAt ?? request.proposedClockInAt?.toISOString(),
    clockOutAt: override.clockOutAt ?? request.proposedClockOutAt?.toISOString(),
    reason,
  };
}
