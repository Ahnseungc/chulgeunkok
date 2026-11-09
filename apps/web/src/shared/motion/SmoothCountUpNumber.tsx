'use client';

import { AnimatedNumber } from './AnimatedNumber';

/** y 이동이 먹도록 inline-block 계열로 두고, 숫자 폭을 고정해 흔들림을 막는다 */
const NUMBER_STYLE = {
  display: 'inline-flex',
  alignItems: 'baseline',
  fontVariantNumeric: 'tabular-nums',
} as const;

interface SmoothCountUpNumberProps {
  value: number;
  animateFrom?: number;
  durationSec?: number;
  className?: string;
  suffix?: string;
  fractionDigits?: number;
  useGrouping?: boolean;
  formatValue?: (n: number) => string;
  formatInputSnapDecimals?: number;
  ease?: (t: number) => number;
}

/** 부드러운 숫자 카운트업 — 금액·인원 등 정수 표시용. animateFrom이 없으면 바로 표시 */
export function SmoothCountUpNumber({
  value,
  animateFrom,
  durationSec = 0,
  className,
  suffix,
  fractionDigits = 0,
  useGrouping = true,
  formatValue,
  formatInputSnapDecimals,
  ease,
}: SmoothCountUpNumberProps) {
  const shouldAnimate = animateFrom != null && Number.isFinite(animateFrom) && animateFrom !== value;

  return (
    <AnimatedNumber
      className={className}
      style={NUMBER_STYLE}
      value={value}
      animateFrom={shouldAnimate ? animateFrom : undefined}
      duration={shouldAnimate ? durationSec : 0}
      fractionDigits={fractionDigits}
      useGrouping={useGrouping}
      formatValue={formatValue}
      formatInputSnapDecimals={formatInputSnapDecimals}
      ease={ease}
    >
      {suffix ? <span>{suffix}</span> : null}
    </AnimatedNumber>
  );
}
