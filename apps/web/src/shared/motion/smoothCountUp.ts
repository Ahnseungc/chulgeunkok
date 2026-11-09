import { easeOutExpo } from './easing';

/** 초반 가속 → 끝에서 감속 정지. Framer `animate`·rAF 카운트업 공통 */
export const SMOOTH_COUNT_UP_EASE = easeOutExpo;

const MIN_DURATION_MS = 750;
const MAX_DURATION_MS = 1_300;
const SECOND_MS = 1000;
/** 이 자릿수(10^3)부터 길이를 늘리기 시작해 3자리 더 커지면 최대 */
const DURATION_LOG_START = 3;
const DURATION_LOG_SPAN = 3;

/**
 * 인트로 카운트업 시작 비율.
 * 0이면 초반이 비고, 0.4를 넘기면 남은 구간이 짧아 움직임이 거의 없다.
 * easeOutExpo와 맞춰 목표의 35%에서 시작해 끝에서 감속 정지한다.
 */
export const SMOOTH_COUNT_UP_INTRO_RATIO = 0.35;

/** 카운트업 재생 중 페이드. 0이면 시작값이 안 보이고, 0.5면 투명 차이가 거의 없다 */
export const SMOOTH_COUNT_UP_FADE_OPACITY_FROM = 0.22;
/** 아래에서 올라오며 정착 — TextEntrance와 같은 y */
export const SMOOTH_COUNT_UP_FADE_Y_PX = 6;

export function shouldPlayCountUpFade(options: {
  durationSec: number;
  target: number;
  animateFrom?: number;
  countFromZero?: boolean;
  reduceMotion?: boolean | null;
}): boolean {
  if (options.reduceMotion || options.durationSec <= 0) return false;
  if (options.countFromZero && options.target !== 0) return true;
  return options.animateFrom != null && Number.isFinite(options.animateFrom) && options.animateFrom !== options.target;
}

/** 목표값의 인트로 시작점. 0·비정상이면 0 */
export function resolveSmoothCountUpIntroFrom(target: number): number {
  if (!Number.isFinite(target) || target === 0) return 0;
  return target * SMOOTH_COUNT_UP_INTRO_RATIO;
}

/** 변화량에 따라 카운트업 길이를 조절 (큰 금액일수록 조금 더 길게) */
export function resolveSmoothCountUpDurationMs(from: number, to: number): number {
  const delta = Math.abs(to - from);
  if (delta === 0) return 0;

  const logDelta = Math.log10(Math.max(delta, 1));
  const ratio = Math.min(Math.max((logDelta - DURATION_LOG_START) / DURATION_LOG_SPAN, 0), 1);

  return Math.round(MIN_DURATION_MS + ratio * (MAX_DURATION_MS - MIN_DURATION_MS));
}

export function resolveSmoothCountUpDurationSec(from: number, to: number): number {
  return resolveSmoothCountUpDurationMs(from, to) / SECOND_MS;
}

/** rAF 카운트업용 — eased progress(0~1)를 정수로 변환 */
export function interpolateSmoothCountValue(from: number, to: number, easedProgress: number): number {
  if (easedProgress >= 1) return to;
  if (easedProgress <= 0) return from;

  const raw = from + (to - from) * easedProgress;
  return to >= from ? Math.min(Math.floor(raw), to) : Math.max(Math.ceil(raw), to);
}

export function easeSmoothCountProgress(linearProgress: number): number {
  return easeOutExpo(linearProgress);
}
