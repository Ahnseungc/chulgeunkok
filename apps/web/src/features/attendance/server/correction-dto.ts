import type { Attendance, CorrectionRequest, Membership, User } from '@chulgeunkok/db';

import type { CorrectionDto } from '../model/attendance-admin-types';

export type CorrectionWithAttendance = CorrectionRequest & {
  attendance: Attendance & { membership: Membership & { user: User } };
};

export function toCorrectionDto(request: CorrectionWithAttendance): CorrectionDto {
  return {
    id: request.id,
    attendanceId: request.attendanceId,
    memberId: request.attendance.membershipId,
    memberName: request.attendance.membership.user.name,
    type: request.type,
    proposedClockInAt: request.proposedClockInAt?.toISOString() ?? null,
    proposedClockOutAt: request.proposedClockOutAt?.toISOString() ?? null,
    reason: request.reason,
    status: request.status,
    decisionNote: request.decisionNote,
    createdAt: request.createdAt.toISOString(),
    decidedAt: request.decidedAt?.toISOString() ?? null,
    attendance: {
      clockInAt: request.attendance.clockInAt.toISOString(),
      clockOutAt: request.attendance.clockOutAt?.toISOString() ?? null,
      status: request.attendance.status,
    },
  };
}
