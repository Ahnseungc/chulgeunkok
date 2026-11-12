import type { AttendanceBreak, DbClient, Prisma, PrismaClient } from '@chulgeunkok/db';

import { ApiError } from '@/server/http/api-error';

import type { AttendanceBreakDto, BreakResultDto } from '../model/punch-types';

import { findActiveMembership, findOpenAttendance, lockMembership } from './punch-context';

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

/** 퇴근·퇴근 누락 전환·무효 처리 때 열린 휴게를 그 시각으로 닫는다 (docs/specs/attendance §3.6) */
export async function closeOpenBreak(tx: DbClient, input: { attendanceId: string; at: Date }) {
  const open = await findOpenBreak(tx, input.attendanceId);
  if (!open) return;
  await tx.attendanceBreak.update({ where: { id: open.id }, data: { endAt: input.at } });
}

const clampDate = (at: Date, min: Date, max: Date) => (at < min ? min : at > max ? max : at);

/**
 * 근무 시각을 고치면 휴게를 [출근, 퇴근] 안으로 자른다 (docs/specs/attendance §3.6). 열린 휴게는 퇴근 시각으로 닫는다.
 * 근무 밖으로 완전히 나간 휴게는 지우지 않고 가까운 경계에서 길이 0으로 접는다 (남긴 기록은 보존)
 */
export async function clampBreaksToAttendance(tx: DbClient, input: { attendanceId: string; clockInAt: Date; clockOutAt: Date }) {
  const breaks = await tx.attendanceBreak.findMany({ where: { attendanceId: input.attendanceId } });
  for (const attendanceBreak of breaks) {
    const startAt = clampDate(attendanceBreak.startAt, input.clockInAt, input.clockOutAt);
    const endAt = clampDate(attendanceBreak.endAt ?? input.clockOutAt, startAt, input.clockOutAt);
    if (startAt.getTime() === attendanceBreak.startAt.getTime() && endAt.getTime() === attendanceBreak.endAt?.getTime()) continue;
    await tx.attendanceBreak.update({ where: { id: attendanceBreak.id }, data: { startAt, endAt } });
  }
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
  await lockMembership(tx, membership.id);
  const attendance = await findOpenAttendance(tx, membership.id);
  if (!attendance) throw new ApiError('NOT_WORKING');
  return attendance;
}

function findOpenBreak(db: DbClient, attendanceId: string) {
  return db.attendanceBreak.findFirst({ where: { attendanceId, endAt: null } });
}
