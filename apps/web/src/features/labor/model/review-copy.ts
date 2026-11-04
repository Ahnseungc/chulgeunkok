import type { ReviewPresentation } from './labor-types';

/** 검토 항목 문구. 정본: docs/specs/labor §6.3 */

export const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const;

type HeadcountBand = 'UNDER_5' | 'FIVE_OR_MORE' | 'UNKNOWN';

interface CopyContext {
  minimumHourlyWage: number;
  ruleYear: string;
}

const won = (amount: number) => `${amount.toLocaleString('ko-KR')}원`;

const weekdayOf = (reasonCode: string) => {
  const weekday = Number(reasonCode.replace('DAY_', ''));
  return `${WEEKDAY_LABELS[weekday] ?? ''}요일`;
};

export function reviewCopy(
  review: { type: string; reasonCode: string },
  context: CopyContext,
): { title: string; body: string } {
  switch (review.type) {
    case 'MINIMUM_WAGE':
      return {
        title: '최저임금보다 낮아요',
        body: `입력한 시급이 ${context.ruleYear}년 최저임금(${won(context.minimumHourlyWage)})보다 낮아요. 시급을 확인해 주세요.`,
      };
    case 'BREAK_SHORTAGE':
      return {
        title: '휴게시간이 부족해요',
        body: `${weekdayOf(review.reasonCode)} 근무에 법정 휴게시간이 부족해요. 4시간마다 30분 이상 쉬어야 해요.`,
      };
    case 'WEEKLY_HOLIDAY':
      return review.reasonCode === 'HOLIDAY_NOT_SET'
        ? {
            title: '주휴일을 정해 주세요',
            body: '주 15시간 이상 일하는 직원이에요. 주휴일을 정하면 주휴수당 예상액을 알려드릴 수 있어요.',
          }
        : {
            title: '주휴수당 대상일 수 있어요',
            body: '입력한 근로조건에 따르면 주휴수당 적용 대상일 수 있어요. 소정근로일을 다 나오면 주휴일에 하루치 임금이 생겨요.',
          };
    case 'SHORT_TIME_OVERTIME':
      return {
        title: '정한 시간을 넘기면 가산수당이 생길 수 있어요',
        body: '단시간 근로자는 정한 시간을 넘겨 일하면 5인 이상 사업장에서 가산수당이 생길 수 있어요.',
      };
    default:
      return { title: '확인이 필요한 항목이 있어요', body: '근로조건과 근무 기록을 확인해 주세요.' };
  }
}

/** 5인 미만으로 신고한 매장에서는 가산수당 안내를 배지로만 둔다 (docs/specs/labor §6.2) */
const PREMIUM_TYPES: ReadonlySet<string> = new Set(['SHORT_TIME_OVERTIME', 'NIGHT_WORK', 'OVERTIME']);

export function reviewPresentation(type: string, band: HeadcountBand): ReviewPresentation {
  if (type === 'ABSENCE_SUSPECTED') return 'LIST';
  if (PREMIUM_TYPES.has(type) && band === 'UNDER_5') return 'BADGE';
  return 'SHEET';
}

/** 5인 미만 매장의 가산수당 배지 문구 */
export const UNDER_FIVE_BADGE_TEXT = '5인 미만 사업장은 가산수당 의무가 없지만, 기록은 보관돼요.';
