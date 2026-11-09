'use client';

import { motion, useReducedMotion, type Transition } from 'framer-motion';
import { createContext, type ReactNode, useContext, useMemo } from 'react';

import {
  ENTRANCE_STYLE_SLIDE_IN_RIGHT_DISTANCE,
  entranceStyleChildTransition,
  entranceStyleListTransition,
  entranceStyleStaggerDelay,
} from './entranceStyleMotion';
import { PAGE_ENTRANCE_Y_OFFSET_PX, pageEntranceTransition } from './pageEntranceMotion';

/** 스태거 입장 애니메이션용 스프링 프리셋 */
export const staggerTransitions = {
  content: { type: 'spring' as const, stiffness: 300, damping: 30 },
  icon: { type: 'spring' as const, stiffness: 320, damping: 24, mass: 0.8 },
} as const;

const DEFAULT_STAGGER_CHILDREN_S = 0.12;
const DEFAULT_DELAY_CHILDREN_S = 0.05;
const DEFAULT_FADE_UP_PX = 8;
const DEFAULT_FADE_DOWN_PX = 6;
const DEFAULT_SCALE_IN_FROM = 0.92;
const FADE_DOWN_SCALE_FROM = 0.98;

const StaggeredEntranceContext = createContext(false);

export type StaggerItemVariant = 'fadeUp' | 'fadeDown' | 'smoothDown' | 'scaleIn' | 'fade' | 'slideInRight';

interface StaggeredEntranceProps {
  children: ReactNode;
  /** stagger 간격(초). 기본 0.12 */
  staggerChildren?: number;
  /** 첫 자식 전 delay(초). 기본 0.05 */
  delayChildren?: number;
  className?: string;
}

/**
 * 자식들을 순차적으로 등장시키는 스태거 루트.
 * 직계 자식은 StaggeredEntranceItem 이어야 하며 "hidden" → "visible" variants로 연동된다.
 */
export function StaggeredEntrance({
  children,
  staggerChildren = DEFAULT_STAGGER_CHILDREN_S,
  delayChildren = DEFAULT_DELAY_CHILDREN_S,
  className,
}: StaggeredEntranceProps) {
  const reduced = Boolean(useReducedMotion());

  return (
    <StaggeredEntranceContext.Provider value={reduced}>
      <motion.div
        className={className}
        initial="hidden"
        animate="visible"
        variants={{ visible: { transition: { staggerChildren, delayChildren } }, hidden: {} }}
      >
        {children}
      </motion.div>
    </StaggeredEntranceContext.Provider>
  );
}

function getItemTransition(variant: StaggerItemVariant, reduced: boolean, delay: number): Transition {
  if (reduced) return { duration: 0 };
  if (variant === 'slideInRight') return entranceStyleListTransition(delay);
  if (variant === 'fadeDown') return entranceStyleChildTransition(delay);
  if (variant === 'smoothDown') return pageEntranceTransition(delay);
  // delay: 0을 넣으면 부모 staggerChildren이 무시되어 일괄 등장한다
  return delay > 0 ? { ...staggerTransitions.content, delay } : staggerTransitions.content;
}

/** variant별 시작 오프셋. 축소 모션이면 이동 없이 opacity도 1에서 시작한다 */
function getHiddenOffset(variant: StaggerItemVariant, distance?: number) {
  switch (variant) {
    case 'fadeUp':
      return { y: distance ?? DEFAULT_FADE_UP_PX };
    case 'fadeDown':
      return { y: -(distance ?? DEFAULT_FADE_DOWN_PX), scale: FADE_DOWN_SCALE_FROM };
    case 'smoothDown':
      return { y: -(distance ?? PAGE_ENTRANCE_Y_OFFSET_PX) };
    case 'scaleIn':
      return { scale: distance ?? DEFAULT_SCALE_IN_FROM };
    case 'slideInRight':
      return { x: distance ?? ENTRANCE_STYLE_SLIDE_IN_RIGHT_DISTANCE };
    case 'fade':
      return {};
  }
}

function getItemVariants(variant: StaggerItemVariant, reduced: boolean, distance?: number, delay = 0) {
  const offset = getHiddenOffset(variant, distance);
  const settled = {
    ...('x' in offset && { x: 0 }),
    ...('y' in offset && { y: 0 }),
    ...('scale' in offset && { scale: 1 }),
  };
  return {
    hidden: reduced ? { opacity: 1, ...settled } : { opacity: 0, ...offset },
    visible: { opacity: 1, ...settled, transition: getItemTransition(variant, reduced, delay) },
  };
}

interface StaggeredEntranceItemProps {
  children: ReactNode;
  /** smoothDown=위에서 부드럽게 연속 등장, fadeDown=위에서 등장+미세 scale */
  variant?: StaggerItemVariant;
  /** 이동·축소 거리 */
  distance?: number;
  className?: string;
}

/** StaggeredEntrance 안의 한 덩어리 */
export function StaggeredEntranceItem({ children, variant = 'fadeUp', distance, className }: StaggeredEntranceItemProps) {
  const reduced = useContext(StaggeredEntranceContext);
  const variants = useMemo(() => getItemVariants(variant, reduced, distance), [variant, reduced, distance]);

  return (
    <motion.div className={className} variants={variants}>
      {children}
    </motion.div>
  );
}

interface StaggeredEntranceIndexedItemProps {
  children: ReactNode;
  /** 스태거 순서(0부터). 동적 리스트에서 행별 delay 계산에 사용 */
  index: number;
  variant?: StaggerItemVariant;
  distance?: number;
  /** 첫 행 전 기본 delay(초). 기본 0.05 */
  baseDelay?: number;
  /** delay 계산 시 index 상한. 기본 12 */
  maxStaggerIndex?: number;
  /** false면 마운트 시 등장 애니메이션을 건너뛴다 */
  play?: boolean;
  className?: string;
}

/** 부모 StaggeredEntrance 없이 index 기반 delay로 등장하는 행 */
export function StaggeredEntranceIndexedItem({
  children,
  index,
  variant = 'slideInRight',
  distance,
  baseDelay = DEFAULT_DELAY_CHILDREN_S,
  maxStaggerIndex,
  play = true,
  className,
}: StaggeredEntranceIndexedItemProps) {
  const reduced = Boolean(useReducedMotion());
  const delay = reduced ? 0 : entranceStyleStaggerDelay(index, baseDelay, maxStaggerIndex);
  const variants = useMemo(() => getItemVariants(variant, reduced, distance, delay), [variant, reduced, distance, delay]);

  return (
    <motion.div
      className={className}
      initial={play ? 'hidden' : false}
      animate="visible"
      variants={variants}
      style={{ willChange: reduced || !play ? undefined : 'transform, opacity' }}
    >
      {children}
    </motion.div>
  );
}
