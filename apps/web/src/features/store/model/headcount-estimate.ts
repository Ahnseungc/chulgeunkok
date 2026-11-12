import type { HeadcountBandValue } from './store-settings-types';

/** 상시근로자 수 기준 (근로기준법 시행령 §7의2, docs/specs/store §6.4) */
const FIVE_OR_MORE_THRESHOLD = 5;

export type HeadcountMismatch = 'MAYBE_FIVE_OR_MORE' | 'MAYBE_UNDER_5';

export interface HeadcountEstimate {
  /** 소수 첫째 자리. 가동일수가 0이면 null */
  average: number | null;
  /** 연인원: 날짜별 서로 다른 근무자 수의 합 */
  workerDays: number;
  /** 근무 기록이 1건 이상인 날 수 */
  operatingDays: number;
}

/** 근무자는 (날짜, 멤버) 한 쌍으로 한 번만 센다. 평균은 half up 으로 소수 첫째 자리 (docs/specs/store §6.4) */
export function estimateHeadcount(rows: { localDate: string; membershipId: string }[]): HeadcountEstimate {
  const membersByDate = new Map<string, Set<string>>();
  for (const { localDate, membershipId } of rows) {
    membersByDate.set(localDate, (membersByDate.get(localDate) ?? new Set()).add(membershipId));
  }
  const operatingDays = membersByDate.size;
  const workerDays = [...membersByDate.values()].reduce((sum, members) => sum + members.size, 0);
  if (operatingDays === 0) return { average: null, workerDays, operatingDays };
  // 정수 연산으로 반올림해 부동소수점 경계 오차를 피한다: floor(x * 10 + 0.5) / 10
  const tenths = Math.floor((workerDays * 20 + operatingDays) / (operatingDays * 2));
  return { average: tenths / 10, workerDays, operatingDays };
}

/** 신고값과 평균(반올림 전 `workerDays / operatingDays`)이 어긋나는지. 미신고(UNKNOWN)·평균 없음은 안내하지 않는다 (docs/specs/store §6.4) */
export function headcountMismatch(average: number | null, band: HeadcountBandValue): HeadcountMismatch | null {
  if (average === null) return null;
  if (band === 'UNDER_5' && average >= FIVE_OR_MORE_THRESHOLD) return 'MAYBE_FIVE_OR_MORE';
  if (band === 'FIVE_OR_MORE' && average < FIVE_OR_MORE_THRESHOLD) return 'MAYBE_UNDER_5';
  return null;
}
