'use client';

import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'framer-motion';
import { type CSSProperties, type ReactNode, useEffect } from 'react';

import { ENTRANCE_STYLE_EASE } from './entranceStyleMotion';
import { shouldPlayCountUpFade, SMOOTH_COUNT_UP_EASE, SMOOTH_COUNT_UP_FADE_OPACITY_FROM, SMOOTH_COUNT_UP_FADE_Y_PX } from './smoothCountUp';

const DEFAULT_DURATION_S = 0.55;

interface AnimatedNumberProps {
  value: number;
  fractionDigits?: number;
  useGrouping?: boolean;
  className?: string;
  style?: CSSProperties;
  duration?: number;
  /** 지정 시 `fractionDigits` / `useGrouping` 대신 이 함수로 표시 문자열을 만든다 */
  formatValue?: (n: number) => string;
  /** `formatValue` 사용 시: 중간 프레임 값을 이 소수 자릿수에서 반올림한다 */
  formatInputSnapDecimals?: number;
  /** true면 마운트 시 0에서 `value`로 애니메이션한다. 이후 변경은 현재 표시 값에서 이어진다 */
  countFromZero?: boolean;
  /** `duration` > 0일 때 애니메이션 시작 숫자 (미지정 시 현재 값에서 이어짐) */
  animateFrom?: number;
  /** 카운트업 이징. 기본 `SMOOTH_COUNT_UP_EASE` */
  ease?: (t: number) => number;
  children?: ReactNode;
}

function snapToDecimals(n: number, decimals: number): number {
  if (!Number.isFinite(n) || decimals < 0) return n;
  const p = 10 ** decimals;
  return Math.round(n * p) / p;
}

/** 숫자 카운트업. 모션 줄이기 설정이면 바로 최종 값을 보여 준다 */
export function AnimatedNumber({
  value,
  fractionDigits = 0,
  useGrouping = true,
  className,
  style,
  duration = DEFAULT_DURATION_S,
  formatValue,
  formatInputSnapDecimals,
  countFromZero = false,
  animateFrom,
  ease = SMOOTH_COUNT_UP_EASE,
  children,
}: AnimatedNumberProps) {
  const shouldReduceMotion = Boolean(useReducedMotion());
  const effectiveDuration = shouldReduceMotion ? 0 : duration;
  const snappedValue = formatValue != null && formatInputSnapDecimals != null ? snapToDecimals(value, formatInputSnapDecimals) : value;
  const hasAnimateFrom = effectiveDuration > 0 && animateFrom != null && Number.isFinite(animateFrom);

  const initialValue = hasAnimateFrom ? animateFrom : countFromZero && effectiveDuration > 0 ? 0 : snappedValue;
  const motionValue = useMotionValue(initialValue);
  const shouldFade = shouldPlayCountUpFade({
    durationSec: effectiveDuration,
    target: snappedValue,
    animateFrom,
    countFromZero,
    reduceMotion: shouldReduceMotion,
  });

  const displayValue = useTransform(motionValue, (latest) => {
    const safeLatest = Number.isFinite(latest) ? latest : 0;
    if (formatValue) {
      return formatValue(formatInputSnapDecimals != null ? snapToDecimals(safeLatest, formatInputSnapDecimals) : safeLatest);
    }
    return safeLatest.toLocaleString('ko-KR', {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
      useGrouping,
    });
  });

  useEffect(() => {
    if (effectiveDuration <= 0) {
      motionValue.set(snappedValue);
      return;
    }
    if (hasAnimateFrom) motionValue.set(animateFrom);
    const controls = animate(motionValue, snappedValue, { duration: effectiveDuration, ease });
    return () => controls.stop();
  }, [motionValue, snappedValue, effectiveDuration, hasAnimateFrom, animateFrom, ease]);

  return (
    <motion.span
      className={className}
      initial={shouldFade ? { opacity: SMOOTH_COUNT_UP_FADE_OPACITY_FROM, y: SMOOTH_COUNT_UP_FADE_Y_PX } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: shouldFade ? effectiveDuration : 0, ease: ENTRANCE_STYLE_EASE }}
      style={{ ...style, willChange: shouldFade ? 'transform, opacity' : undefined }}
    >
      {/* MotionValue는 motion 노드의 단독 자식일 때만 텍스트로 렌더된다 */}
      <motion.span>{displayValue}</motion.span>
      {children}
    </motion.span>
  );
}
