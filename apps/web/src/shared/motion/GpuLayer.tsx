import type { CSSProperties, ReactNode } from 'react';

import { ENTRANCE_STYLE_DURATION, entranceStyleStaggerDelay } from './entranceStyleMotion';

/** globals.css — 애니메이션 없이 합성 레이어만 올린다 */
export const GPU_LAYER_CLASS = 'gpu-layer';
/** globals.css — CSS slideInRight 입장 */
export const GPU_LAYER_SLIDE_IN_RIGHT_CLASS = 'gpu-layer-slide-in-right';

/** CSS slideInRight 기본 이동 거리 — Framer Motion 기본(24px)보다 짧게 */
export const GPU_LAYER_SLIDE_IN_RIGHT_DISTANCE = 12;

const DEFAULT_BASE_DELAY_S = 0.05;

type GpuLayerEntrance = 'none' | 'slideInRight';

interface GpuLayerProps {
  children: ReactNode;
  className?: string;
  /** CSS 입장 애니메이션. 기본 none */
  entrance?: GpuLayerEntrance;
  /** slideInRight 스태거 순서(0부터) */
  index?: number;
  /** slideInRight 이동 거리(px). 기본 12 */
  distance?: number;
  /** 첫 행 전 기본 delay(초). 기본 0.05 */
  baseDelay?: number;
  /** delay 계산 시 index 상한 */
  maxStaggerIndex?: number;
}

/**
 * Framer Motion 없이 CSS로 합성 레이어를 올린다. Server Component에서도 쓸 수 있다.
 * `entrance="slideInRight"` 면 짧은 오른쪽 슬라이드 인을 CSS animation으로 적용한다 (모션 줄이기면 globals.css가 끈다).
 */
export function GpuLayer({
  children,
  className,
  entrance = 'none',
  index = 0,
  distance = GPU_LAYER_SLIDE_IN_RIGHT_DISTANCE,
  baseDelay = DEFAULT_BASE_DELAY_S,
  maxStaggerIndex,
}: GpuLayerProps) {
  const slideInRight = entrance === 'slideInRight';
  const style: CSSProperties | undefined = slideInRight
    ? ({
        '--gpu-layer-delay': `${entranceStyleStaggerDelay(index, baseDelay, maxStaggerIndex).toFixed(2)}s`,
        '--gpu-layer-slide-distance': `${distance}px`,
        '--gpu-layer-duration': `${ENTRANCE_STYLE_DURATION.list}s`,
      } as CSSProperties)
    : undefined;
  const classes = [GPU_LAYER_CLASS, slideInRight ? GPU_LAYER_SLIDE_IN_RIGHT_CLASS : null, className].filter(Boolean).join(' ');

  return (
    <div className={classes} style={style}>
      {children}
    </div>
  );
}
