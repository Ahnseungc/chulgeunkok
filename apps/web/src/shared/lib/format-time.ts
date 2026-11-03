/** MVP는 매장 시간대가 Asia/Seoul 고정이다 (docs/specs/README.md §2.1) */
export const STORE_TIME_ZONE = 'Asia/Seoul';

const clockFormatter = new Intl.DateTimeFormat('ko-KR', {
  timeZone: STORE_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** `2026-11-02T09:02:00Z` → `18:02` */
export function formatClock(iso: string): string {
  return clockFormatter.format(new Date(iso));
}

/** 경과 시간 → `4시간 33분`. 1분 미만은 `1분 미만` */
export function formatDuration(milliseconds: number): string {
  const totalMinutes = Math.floor(milliseconds / 60_000);
  if (totalMinutes < 1) return '1분 미만';
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}분`;
  return minutes === 0 ? `${hours}시간` : `${hours}시간 ${minutes}분`;
}

const localDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: STORE_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** 매장 시간대 기준 날짜 `YYYY-MM-DD` (DB `@db.Date` 컬럼용) */
export function toStoreLocalDate(at: Date): string {
  return localDateFormatter.format(at);
}
