/** 서버·클라이언트 공용 근로조건·검토 타입. docs/specs/labor */

export interface TermsScheduleDto {
  weekday: number;
  startTime: string; // "18:00"
  endTime: string; // "02:00" → 익일
  breakMinutes: number;
}

export interface TermsDto {
  id: string;
  version: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  hourlyWage: number;
  schedules: TermsScheduleDto[];
  scheduleVaries: boolean;
  averageWeeklyMinutesOverride: number | null;
  weeklyHolidayWeekday: number | null;
  contractStartDate: string;
  contractEndDate: string | null;
  weeklyContractMinutes: number;
}

export type LaborReviewStatus =
  | 'OPEN'
  | 'NEEDS_INFORMATION'
  | 'ACKNOWLEDGED'
  | 'RESOLVED'
  | 'SUPERSEDED';

/** docs/specs/labor §6.2 — 바텀시트로 띄울지, 배지만 둘지, 목록에만 둘지 */
export type ReviewPresentation = 'SHEET' | 'BADGE' | 'LIST';

export interface LaborReviewDto {
  id: string;
  memberId: string;
  type: string;
  reasonCode: string;
  status: LaborReviewStatus;
  presentation: ReviewPresentation;
  seen: boolean;
  title: string;
  body: string;
  createdAt: string;
}

export interface CreateTermsResultDto {
  terms: TermsDto;
  reviews: LaborReviewDto[];
}

/** 모든 안내 하단 고지 (docs/specs/labor §6.3) */
export const REVIEW_DISCLAIMER = '참고용 안내예요. 정확한 판단은 노무사와 상의해 주세요.';
