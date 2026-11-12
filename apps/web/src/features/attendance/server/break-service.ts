import type { AttendanceBreak, DbClient, Prisma, PrismaClient } from '@chulgeunkok/db';

import { ApiError } from '@/server/http/api-error';

import type { AttendanceBreakDto, BreakResultDto } from '../model/punch-types';

import { findActiveMembership, findOpenAttendance } from './punch-context';

interface BreakInput {
  userId: string;
  storeId: string;
  now: Date;
}

/**
 * POST /attendance/break/start — 근무 중인 본인만. 이미 휴게 중이면 그 휴게를 그대로 돌려준다 (docs/specs/attendance §3.6)
 * punch와 같은 Membership 행 잠금으로 퇴근과 직렬화한다
 */
export async function startBreak(db: PrismaClient, input: BreakInput): Promise<BreakResultDto> {
  return db.$transaction(async (tx) => {
    const attendance = await lockOpenAttendance(tx, input);
    const open = await findOpenBreak(tx, attendance.id);
    const started = open ?? (await tx.attendanceBreak.create({ data: { attendanceId: attendance.id, startAt: input.now } }));
    return { attendanceId: attendance.id, break: toBreakDto(started) };
  });
}

/** POST /attendance/break/end — 열린 휴게가 없으면 BREAK_NOT_STARTED (docs/specs/attendance §3.6) */
export async function endBreak(db: PrismaClient, input: BreakInput): Promise<BreakResultDto> {
  return db.$transaction(async (tx) => {
    const attendance = await lockOpenAttendance(tx, input);
    const open = await findOpenBreak(tx, attendance.id);
    if (!open) throw new ApiError('BREAK_NOT_STARTED');
    const ended = await tx.attendanceBreak.update({ where: { id: open.id }, data: { endAt: input.now } });
    return { attendanceId: attendance.id, break: toBreakDto(ended) };
  });
}

/**
 * 퇴근·퇴근 누락 전환·관리자 퇴근 입력 때 열린 휴게를 닫는다 (docs/specs/attendance §3.6).
 * 관리자가 퇴근을 휴게 시작보다 앞으로 당기면 시작 시각으로 닫는다 (정산은 근무 안 부분만 뺀다)
 */
export async function closeOpenBreak(tx: DbClient, input: { attendanceId: string; at: Date }) {
  const open = await findOpenBreak(tx, input.attendanceId);
  if (!open) return;
  const endAt = input.at > open.startAt ? input.at : open.startAt;
  await tx.attendanceBreak.update({ where: { id: open.id }, data: { endAt } });
}

export function toBreakDto(attendanceBreak: AttendanceBreak): AttendanceBreakDto {
  return {
    id: attendanceBreak.id,
    startAt: attendanceBreak.startAt.toISOString(),
    endAt: attendanceBreak.endAt?.toISOString() ?? null,
  };
}

async function lockOpenAttendance(tx: Prisma.TransactionClient, input: BreakInput) {
  const membership = await findActiveMembership(tx, input);
  await tx.$queryRaw`SELECT "id" FROM "Membership" WHERE "id" = ${membership.id} FOR UPDATE`;
  const attendance = await findOpenAttendance(tx, membership.id);
  if (!attendance) throw new ApiError('NOT_WORKING');
  return attendance;
}

function findOpenBreak(db: DbClient, attendanceId: string) {
  return db.attendanceBreak.findFirst({ where: { attendanceId, endAt: null } });
}
