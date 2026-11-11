import { z } from 'zod';

import { LocalDate, Weekday } from '@/shared/schema/common';

const MINUTES_PER_DAY = 1440;
const MAX_WEEKLY_MINUTES = 52 * 60;
const MAX_HOURLY_WAGE = 1_000_000;

const ClockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'HH:mm 형식으로 입력해 주세요.');

const toMinute = (time: string) => {
  const [hours = 0, minutes = 0] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

/** 퇴근이 출근보다 이르면 익일 퇴근 (18:00–02:00 → 480분) */
export const toWorkMinutes = (startTime: string, endTime: string) =>
  (toMinute(endTime) - toMinute(startTime) + MINUTES_PER_DAY) % MINUTES_PER_DAY;

/** docs/specs/labor §3.1 */
export const DailyScheduleInput = z
  .object({
    weekday: Weekday,
    startTime: ClockTime,
    endTime: ClockTime,
    breakMinutes: z.number().int().min(0),
  })
  .superRefine((schedule, ctx) => {
    const workMinutes = toWorkMinutes(schedule.startTime, schedule.endTime);
    if (workMinutes === 0) {
      ctx.addIssue({ code: 'custom', path: ['endTime'], message: '출근과 퇴근 시각이 같아요.' });
      return;
    }
    if (schedule.breakMinutes >= workMinutes) {
      ctx.addIssue({
        code: 'custom',
        path: ['breakMinutes'],
        message: '휴게시간이 근무시간보다 길어요.',
      });
    }
  });

/** docs/specs/labor §3.1 */
export const CreateTermsBody = z
  .object({
    effectiveFrom: LocalDate,
    hourlyWage: z.number().int().positive().max(MAX_HOURLY_WAGE),
    schedules: z.array(DailyScheduleInput).max(7),
    scheduleVaries: z.boolean().default(false),
    averageWeeklyMinutesOverride: z
      .number()
      .int()
      .min(0)
      .max(MAX_WEEKLY_MINUTES)
      .nullable()
      .default(null),
    weeklyHolidayWeekday: Weekday.nullable(),
    contractStartDate: LocalDate,
    contractEndDate: LocalDate.nullable(),
    confirmBelowMinimumWage: z.boolean().default(false),
    /** 임금명세서 공제 방식 (docs/specs/payslip §3.3) */
    deductionType: z.enum(['NONE', 'WITHHOLDING_3_3', 'SOCIAL_INSURANCE']).default('NONE'),
  })
  .superRefine((terms, ctx) => {
    const weekdays = terms.schedules.map((schedule) => schedule.weekday);
    if (new Set(weekdays).size !== weekdays.length) {
      ctx.addIssue({ code: 'custom', path: ['schedules'], message: '같은 요일이 두 번 있어요.' });
    }
    if (terms.scheduleVaries && terms.averageWeeklyMinutesOverride == null) {
      ctx.addIssue({
        code: 'custom',
        path: ['averageWeeklyMinutesOverride'],
        message: '주 평균 근무시간을 입력해 주세요.',
      });
    }
    // LocalDate는 YYYY-MM-DD라 문자열 비교로 날짜 순서를 판단할 수 있다
    if (terms.contractEndDate && terms.contractEndDate < terms.contractStartDate) {
      ctx.addIssue({
        code: 'custom',
        path: ['contractEndDate'],
        message: '계약 종료일을 확인해 주세요.',
      });
    }
    if (terms.effectiveFrom < terms.contractStartDate) {
      ctx.addIssue({
        code: 'custom',
        path: ['effectiveFrom'],
        message: '적용 시작일은 계약 시작일 이후여야 해요.',
      });
    }
  });

export type CreateTermsInput = z.infer<typeof CreateTermsBody>;

const LaborReviewType = z.enum([
  'MINIMUM_WAGE',
  'BREAK_SHORTAGE',
  'WEEKLY_HOLIDAY',
  'SHORT_TIME_OVERTIME',
  'NIGHT_WORK',
  'OVERTIME',
  'HOLIDAY_WORK',
  'ABSENCE_SUSPECTED',
  'SEVERANCE',
  'ANNUAL_LEAVE',
]);

export const LaborReviewListQuery = z.object({
  status: z.enum(['OPEN', 'NEEDS_INFORMATION', 'ACKNOWLEDGED', 'RESOLVED', 'SUPERSEDED']).optional(),
  type: LaborReviewType.optional(),
});

/** docs/specs/labor §8 — 확인 처리 또는 바텀시트 노출 기록 */
export const UpdateLaborReviewBody = z.union([
  z.object({ status: z.literal('ACKNOWLEDGED') }),
  z.object({ seen: z.literal(true) }),
]);

export const LaborRuleQuery = z.object({ date: LocalDate });
