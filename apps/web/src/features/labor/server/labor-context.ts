import type { DbClient, EmploymentTerms, EmploymentTermsSchedule, LaborReview } from '@chulgeunkok/db';

import { ApiError } from '@/server/http/api-error';
import { toStoreLocalDate } from '@/shared/lib/format-time';

import { weeklyContractMinutes } from '../model/labor-rules';
import type { LaborReviewDto, TermsDto } from '../model/labor-types';
import { reviewCopy, reviewPresentation } from '../model/review-copy';

const MINUTES_PER_DAY = 1440;

/** 매장 시간대 날짜 → 그날 00:00 (Asia/Seoul) */
export const storeMidnight = (localDate: string) => new Date(`${localDate}T00:00:00+09:00`);
/** `@db.Date` 컬럼 값 */
export const dateColumn = (localDate: string) => new Date(`${localDate}T00:00:00Z`);

/** `date` 날짜에 적용되는 최저임금·규칙 세트. 없으면 배포 시드 누락 (docs/specs/labor §4.1) */
export async function findRuleSet(db: DbClient, localDate: string) {
  const rule = await db.laborRuleSet.findFirst({
    where: { effectiveFrom: { lte: dateColumn(localDate) } },
    orderBy: { effectiveFrom: 'desc' },
  });
  if (!rule) {
    console.error(`[labor] ${localDate}에 적용할 LaborRuleSet이 없어요`);
    throw new ApiError('INTERNAL');
  }
  return rule;
}

/** 그날 기준 사업장 규모 신고값. 없으면 UNKNOWN (docs/specs/store §6.2) */
export async function findHeadcountBand(db: DbClient, input: { storeId: string; localDate: string }) {
  const declaration = await db.storeHeadcountDeclaration.findFirst({
    where: { storeId: input.storeId, effectiveFrom: { lte: dateColumn(input.localDate) } },
    orderBy: { effectiveFrom: 'desc' },
  });
  return declaration?.band ?? 'UNKNOWN';
}

const toClock = (minuteOfDay: number) => {
  const minutes = ((minuteOfDay % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
};

export function toTermsDto(terms: EmploymentTerms & { schedules: EmploymentTermsSchedule[] }): TermsDto {
  const schedules = [...terms.schedules].sort((a, b) => a.weekday - b.weekday);
  return {
    id: terms.id,
    version: terms.version,
    effectiveFrom: terms.effectiveFrom.toISOString(),
    effectiveTo: terms.effectiveTo?.toISOString() ?? null,
    hourlyWage: terms.hourlyWage,
    schedules: schedules.map((schedule) => ({
      weekday: schedule.weekday,
      startTime: toClock(schedule.startMinute),
      endTime: toClock(schedule.startMinute + schedule.workMinutes),
      breakMinutes: schedule.breakMinutes,
    })),
    scheduleVaries: terms.scheduleVaries,
    averageWeeklyMinutesOverride: terms.averageWeeklyMinutesOverride,
    weeklyHolidayWeekday: terms.weeklyHolidayWeekday,
    contractStartDate: terms.contractStartDate.toISOString().slice(0, 10),
    contractEndDate: terms.contractEndDate?.toISOString().slice(0, 10) ?? null,
    weeklyContractMinutes: weeklyContractMinutes({ ...terms, schedules }),
  };
}

/** 문구·표시 방식은 매장의 오늘 기준 규모와 규칙 세트로 정한다 */
export async function toReviewDtos(
  db: DbClient,
  input: { storeId: string; reviews: LaborReview[]; now: Date },
): Promise<LaborReviewDto[]> {
  const today = toStoreLocalDate(input.now);
  const [band, rule] = await Promise.all([
    findHeadcountBand(db, { storeId: input.storeId, localDate: today }),
    findRuleSet(db, today),
  ]);
  const context = { minimumHourlyWage: rule.minimumHourlyWage, ruleYear: rule.version.split('.')[0] ?? '' };
  return input.reviews.map((review) => ({
    id: review.id,
    memberId: review.membershipId,
    type: review.type,
    reasonCode: review.reasonCode,
    status: review.status,
    presentation: reviewPresentation(review.type, band),
    seen: review.seenAt !== null,
    ...reviewCopy(review, context),
    createdAt: review.createdAt.toISOString(),
  }));
}
