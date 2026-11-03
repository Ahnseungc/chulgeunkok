import type { Attendance, DbClient } from '@chulgeunkok/db';

import { hashToken } from '@/server/crypto/hash-token';
import { ApiError } from '@/server/http/api-error';

import type { AttendanceDto, PunchAction } from '../model/punch-types';

/** QR 토큰 → 매장. 없음 QR_TOKEN_INVALID, 폐기 QR_TOKEN_REVOKED */
export async function resolveQrStore(db: DbClient, qrToken: string) {
  const token = await db.storeQrToken.findUnique({
    where: { tokenHash: hashToken(qrToken) },
    include: { store: true },
  });
  if (!token) throw new ApiError('QR_TOKEN_INVALID');
  if (token.revokedAt) throw new ApiError('QR_TOKEN_REVOKED');
  return token.store;
}

/** 출퇴근은 해당 매장 ACTIVE 직원만. 비활성·비소속 모두 NOT_STORE_MEMBER */
export async function findActiveMembership(
  db: DbClient,
  input: { storeId: string; userId: string },
) {
  const membership = await db.membership.findUnique({
    where: { storeId_userId: { storeId: input.storeId, userId: input.userId } },
  });
  if (!membership || membership.status !== 'ACTIVE') throw new ApiError('NOT_STORE_MEMBER');
  return membership;
}

export function findOpenAttendance(db: DbClient, membershipId: string) {
  return db.attendance.findFirst({ where: { membershipId, status: 'OPEN' } });
}

/** `at` 시각에 유효한 근로조건 버전. effectiveTo는 미포함 경계 */
export function findEffectiveTerms(db: DbClient, input: { membershipId: string; at: Date }) {
  return db.employmentTerms.findFirst({
    where: {
      membershipId: input.membershipId,
      effectiveFrom: { lte: input.at },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: input.at } }],
    },
  });
}

export function nextPunchAction(openAttendance: Attendance | null): PunchAction {
  return openAttendance ? 'CLOCK_OUT' : 'CLOCK_IN';
}

export function toAttendanceDto(attendance: Attendance): AttendanceDto {
  return {
    id: attendance.id,
    storeId: attendance.storeId,
    clockInAt: attendance.clockInAt.toISOString(),
    clockOutAt: attendance.clockOutAt?.toISOString() ?? null,
    status: attendance.status,
  };
}
