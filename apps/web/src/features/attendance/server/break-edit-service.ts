import type { Attendance, AttendanceBreak, Prisma, PrismaClient } from '@chulgeunkok/db';

import { evaluateAttendanceReviewsSafely } from '@/features/labor/server/work-record-review-service';
import { requireMembership } from '@/server/auth/require-membership';
import { ApiError } from '@/server/http/api-error';

import type { AttendanceDetailDto } from '../model/attendance-admin-types';

import { getAttendanceDetail, snapshot } from './attendance-admin-service';
import { isOutsideCorrectionWindow } from './correction-window';
import { lockMembership } from './punch-context';

/** PUT /attendances/:id/breaks 입력 (docs/specs/attendance §7.6) */
export interface AdminBreaksReplace {
  breaks: { startAt: string; endAt: string }[];
  reason: string;
}

interface BreakInterval {
  startAt: Date;
  endAt: Date;
}

const OPEN_MESSAGE = '근무 중인 기록의 휴게는 직원이 남겨요. 퇴근한 뒤에 고쳐 주세요.';
const MISSING_CLOCK_OUT_MESSAGE = '퇴근 시각을 먼저 넣어 주세요.';
const WINDOW_CLOSED_MESSAGE = '35일이 지난 근무는 휴게를 고칠 수 없어요.';
const OUT_OF_RANGE_MESSAGE = '휴게는 출근과 퇴근 사이로 넣어 주세요.';
const END_BEFORE_START_MESSAGE = '휴게 끝이 시작보다 늦어야 해요.';
const OVERLAP_MESSAGE = '휴게 시간이 서로 겹쳐요.';

/**
 * PUT /attendances/:id/breaks — 끝난 근무(CLOSED)의 휴게를 관리자가 통째로 바꾼다 (docs/specs/attendance §7.6).
 * 사유 필수, before/after 에 휴게를 담아 AttendanceRevision 에 남기고 검토를 다시 돌린다.
 * 정산·임금명세서는 근태·휴게를 읽어 계산하므로 따로 처리하지 않는다
 */
export async function replaceBreaksByAdmin(
  db: PrismaClient,
  input: { attendanceId: string; actorUserId: string; body: AdminBreaksReplace; now: Date },
): Promise<AttendanceDetailDto> {
  const current = await db.attendance.findUnique({ where: { id: input.attendanceId } });
  if (!current) throw new ApiError('NOT_FOUND');
  await requireMembership({ storeId: current.storeId, userId: input.actorUserId, action: 'ATTENDANCE_ADMIN' }, db);

  await db.$transaction((tx) =>
    applyBreaksReplace(tx, { current, body: input.body, actorUserId: input.actorUserId, now: input.now }),
  );
  await evaluateAttendanceReviewsSafely(db, { attendanceId: current.id, now: input.now });
  return getAttendanceDetail(db, input);
}

/** 잠금 뒤 다시 읽은 근무로 검사하고, 휴게 교체와 변경 이력을 한 트랜잭션에서 쓴다 (§3.6 동시성) */
async function applyBreaksReplace(
  tx: Prisma.TransactionClient,
  input: { current: Pick<Attendance, 'id' | 'membershipId'>; body: AdminBreaksReplace; actorUserId: string; now: Date },
) {
  await lockMembership(tx, input.current.membershipId);
  const attendance = await tx.attendance.findUniqueOrThrow({
    where: { id: input.current.id },
    include: { breaks: { orderBy: { startAt: 'asc' } } },
  });
  const clockOutAt = assertBreaksEditable(attendance, input.now);
  const next = input.body.breaks
    .map((row) => ({ startAt: new Date(row.startAt), endAt: new Date(row.endAt) }))
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  assertValidBreaks(next, { clockInAt: attendance.clockInAt, clockOutAt });

  await tx.attendanceBreak.deleteMany({ where: { attendanceId: attendance.id } });
  await tx.attendanceBreak.createMany({ data: next.map((row) => ({ attendanceId: attendance.id, ...row })) });
  await tx.attendanceRevision.create({
    data: {
      attendanceId: attendance.id,
      actorId: input.actorUserId,
      reason: input.body.reason,
      before: { ...snapshot(attendance), breaks: attendance.breaks.map(toBreakSnapshot) },
      after: { ...snapshot(attendance), breaks: next.map(toBreakSnapshot) },
    },
  });
}

/** 퇴근까지 끝난 근무만. 근무 중은 직원이 남기고, 퇴근 누락은 퇴근 시각부터 넣는다. 돌려주는 값은 퇴근 시각 */
function assertBreaksEditable(attendance: Attendance, now: Date): Date {
  if (attendance.status === 'OPEN') throw new ApiError('ATTENDANCE_NOT_EDITABLE', { message: OPEN_MESSAGE });
  if (attendance.status === 'MISSING_CLOCK_OUT') {
    throw new ApiError('ATTENDANCE_NOT_EDITABLE', { message: MISSING_CLOCK_OUT_MESSAGE });
  }
  if (attendance.status !== 'CLOSED' || !attendance.clockOutAt) throw new ApiError('ATTENDANCE_NOT_EDITABLE');
  if (isOutsideCorrectionWindow(attendance.clockInAt, now)) {
    throw new ApiError('CORRECTION_WINDOW_CLOSED', { message: WINDOW_CLOSED_MESSAGE });
  }
  return attendance.clockOutAt;
}

/** 시작 순으로 정렬된 휴게: 각각 [출근, 퇴근] 안, 끝 > 시작, 서로 겹치지 않음 (맞닿는 건 된다) */
function assertValidBreaks(breaks: readonly BreakInterval[], range: { clockInAt: Date; clockOutAt: Date }) {
  breaks.forEach((row, index) => {
    if (row.endAt <= row.startAt) throw new ApiError('VALIDATION_FAILED', { message: END_BEFORE_START_MESSAGE });
    if (row.startAt < range.clockInAt || row.endAt > range.clockOutAt) {
      throw new ApiError('VALIDATION_FAILED', { message: OUT_OF_RANGE_MESSAGE });
    }
    const previous = breaks[index - 1];
    if (previous && row.startAt < previous.endAt) throw new ApiError('VALIDATION_FAILED', { message: OVERLAP_MESSAGE });
  });
}

/** 변경 이력 JSON 용 (`BreakSnapshot` 모양). interface 로 적으면 Prisma Json 입력 타입에 맞지 않아 추론에 맡긴다 */
function toBreakSnapshot(row: Pick<AttendanceBreak, 'startAt' | 'endAt'>) {
  return { startAt: row.startAt.toISOString(), endAt: row.endAt?.toISOString() ?? null };
}
