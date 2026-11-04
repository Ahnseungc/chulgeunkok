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

const monthDayFormatter = new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', timeZone: 'UTC' });
const monthDayWeekdayFormatter = new Intl.DateTimeFormat('ko-KR', {
  month: 'numeric',
  day: 'numeric',
  weekday: 'short',
  timeZone: 'UTC',
});
const DAY_MS = 24 * 60 * 60 * 1000;

/** 정산 기간 [start, end) → "11월 1일 ~ 11월 30일" */
export function formatPeriodRange(start: string, end: string): string {
  const lastDay = new Date(Date.parse(`${end}T00:00:00Z`) - DAY_MS);
  return `${monthDayFormatter.format(new Date(`${start}T00:00:00Z`))} ~ ${monthDayFormatter.format(lastDay)}`;
}

/** `2026-11-02` → "11. 2. (월)" */
export function formatLocalDate(localDate: string): string {
  return monthDayWeekdayFormatter.format(new Date(`${localDate}T00:00:00Z`));
}

/** ISO → `<input type="datetime-local">` 값 (매장 시간대) */
export function toLocalDateTimeInput(iso: string): string {
  return new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 16);
}

/** `<input type="datetime-local">` 값 (매장 시간대) → ISO */
export function fromLocalDateTimeInput(value: string): string {
  return new Date(`${value}:00+09:00`).toISOString();
}
