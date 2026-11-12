import { z } from 'zod';

import { IsoDateTime, LocalDate, Reason } from '@/shared/schema/common';

import { ATTENDANCE_STATUSES, PUNCH_ACTIONS } from './model/punch-types';

/** base64url 32바이트 = 43자. docs/specs/store §5.1 */
export const QrToken = z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'QR을 확인할 수 없어요.');

const PunchAction = z.enum(PUNCH_ACTIONS);

/** docs/specs/attendance §3.2 */
export const PunchPreviewQuery = z.object({ qrToken: QrToken });

/** docs/specs/attendance §3.3. 헤더 `Idempotency-Key`는 핸들러에서 검증 */
export const PunchBody = z.object({
  qrToken: QrToken,
  expectedAction: PunchAction,
  location: z
    .object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      accuracyM: z.number().int().nonnegative(),
    })
    .nullable(),
});

const AttendanceStatus = z.enum(ATTENDANCE_STATUSES);

/** 정산 기간 단위. periodStart가 없으면 오늘이 속한 기간 */
export const MyAttendanceQuery = z.object({
  storeId: z.string().min(1),
  periodStart: LocalDate.optional(),
});

/** 정산 기간 단위로 본다. periodStart가 없으면 오늘이 속한 기간 (docs/specs/attendance §8) */
export const StoreAttendanceQuery = z.object({
  periodStart: LocalDate.optional(),
  memberId: z.string().optional(),
  status: AttendanceStatus.optional(),
});

/** docs/specs/attendance §7.1 */
export const CreateCorrectionBody = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('TIME'),
    proposedClockInAt: IsoDateTime.optional(),
    proposedClockOutAt: IsoDateTime.optional(),
    reason: Reason,
  }),
  z.object({ type: z.literal('BREAK_WAIVED'), reason: Reason }),
  z.object({
    type: z.literal('MISSING_CLOCK_OUT'),
    proposedClockOutAt: IsoDateTime,
    reason: Reason,
  }),
]).superRefine((correction, ctx) => {
  if (
    correction.type === 'TIME' &&
    !correction.proposedClockInAt &&
    !correction.proposedClockOutAt
  ) {
    ctx.addIssue({ code: 'custom', message: '바꿀 출근 또는 퇴근 시각을 입력해 주세요.' });
  }
});

export const CorrectionListQuery = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELED']).default('PENDING'),
});

/** docs/specs/attendance §7.3 — 관리자가 제안 시각을 고쳐 승인할 수 있다 */
export const ApproveCorrectionBody = z.object({
  clockInAt: IsoDateTime.optional(),
  clockOutAt: IsoDateTime.optional(),
  decisionNote: z.string().trim().max(200).optional(),
});

export const RejectCorrectionBody = z.object({ decisionNote: Reason });

/** docs/specs/attendance §7.4 */
export const AdminUpdateAttendanceBody = z.object({
  clockInAt: IsoDateTime.optional(),
  clockOutAt: IsoDateTime.nullable().optional(),
  breakWaived: z.boolean().optional(),
  status: z.literal('VOID').optional(),
  reason: Reason,
});

/** docs/specs/attendance §7.5 — 관리자가 빠진 근무를 직접 추가한다 */
export const AdminCreateAttendanceBody = z.object({
  memberId: z.string().min(1),
  clockInAt: IsoDateTime,
  clockOutAt: IsoDateTime,
  breakWaived: z.boolean().default(false),
  reason: Reason,
});
