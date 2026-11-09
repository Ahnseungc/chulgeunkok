'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { type ReactNode, useEffect, useMemo, useRef } from 'react';

import { ENTRANCE_STYLE_DURATION, ENTRANCE_STYLE_EASE, ENTRANCE_STYLE_STAGGER_MAX_INDEX, ENTRANCE_STYLE_STAGGER_STEP_S } from './entranceStyleMotion';

/** 리스트 행 슬라이드업 기본 스태거(초) */
export const LIST_STAGGER_CHILDREN_S = ENTRANCE_STYLE_STAGGER_STEP_S;
/** 첫 행 전 delay(초). 스택 push 슬라이드가 끝난 뒤 데이터가 오므로 기다리지 않는다 */
export const LIST_DELAY_CHILDREN_S = 0;
/** 아래에서 올라오는 거리(px) */
export const LIST_SLIDE_UP_Y = 12;
/** 삭제 시 위로 살짝 올라가며 사라지는 거리(px) */
export const LIST_EXIT_Y = -6;
/** 등장이 끝난 뒤 '이미 본 키'로 넘기기까지 여유(ms) */
const ENTRANCE_SETTLE_MARGIN_MS = 50;
const SECOND_MS = 1000;

const LIST_LAYOUT_TRANSITION = { duration: 0.28, ease: ENTRANCE_STYLE_EASE } as const;
const LIST_EXIT_TRANSITION = {
  height: { duration: 0.28, ease: ENTRANCE_STYLE_EASE },
  opacity: { duration: 0.2, ease: ENTRANCE_STYLE_EASE },
  y: { duration: 0.22, ease: ENTRANCE_STYLE_EASE },
} as const;
const ITEM_STYLE = { overflow: 'hidden', willChange: 'transform, opacity, height' } as const;

interface CardStaggerListProps<T> {
  items: readonly T[];
  getKey: (item: T, index: number) => string;
  renderItem: (item: T, index: number) => ReactNode;
  /** <ul> 클래스 (기존 `.store-list` 등) */
  className?: string;
  /** <li> 클래스 */
  itemClassName?: string;
  'aria-label'?: string;
  /** 스태거 간격(초). 기본 0.06 */
  staggerChildren?: number;
  /** 첫 행 전 delay(초). 기본 0 */
  delayChildren?: number;
  /** 아래에서 올라오는 거리(px). 기본 12 */
  slideUpY?: number;
  enabled?: boolean;
  /** 다시 마운트돼도 이미 보여 준 키는 입장을 건너뛴다 */
  initialPlayedKeys?: readonly string[];
}

/** 긴 목록(근태 기록 등)에서 마지막 행이 한참 뒤에 나오지 않게 순서를 상한에서 자른다 */
function staggerDelay(enteringIndex: number, delayChildren: number, staggerChildren: number): number {
  return delayChildren + Math.min(enteringIndex, ENTRANCE_STYLE_STAGGER_MAX_INDEX) * staggerChildren;
}

function calcEntranceCompleteMs(enteringCount: number, delayChildren: number, staggerChildren: number): number {
  if (enteringCount === 0) return 0;
  const lastEnd = staggerDelay(enteringCount - 1, delayChildren, staggerChildren) + ENTRANCE_STYLE_DURATION.list;
  return lastEnd * SECOND_MS + ENTRANCE_SETTLE_MARGIN_MS;
}

function itemTransition(delay: number) {
  const base = { duration: ENTRANCE_STYLE_DURATION.list, ease: ENTRANCE_STYLE_EASE };
  return { layout: LIST_LAYOUT_TRANSITION, opacity: { ...base, delay }, y: { ...base, delay }, height: base };
}

/**
 * 리스트 행 슬라이드업 스태거 (<ul>/<li>).
 * 등장: 처음 보는 키만 아래에서 순차 상승. 이미 본 키는 그대로 → 재조회(되살아남·폴링)로 같은 목록이 와도 다시 재생하지 않는다.
 * 삭제: 높이·투명도로 접히며 남은 행이 layout으로 따라 올라온다.
 */
export function CardStaggerList<T>({
  items,
  getKey,
  renderItem,
  className,
  itemClassName,
  'aria-label': ariaLabel,
  staggerChildren = LIST_STAGGER_CHILDREN_S,
  delayChildren = LIST_DELAY_CHILDREN_S,
  slideUpY = LIST_SLIDE_UP_Y,
  enabled = true,
  initialPlayedKeys,
}: CardStaggerListProps<T>) {
  const reducedMotion = useReducedMotion();
  const shouldAnimate = enabled && !reducedMotion;

  const playedKeysRef = useRef<Set<string> | null>(null);
  if (playedKeysRef.current === null) playedKeysRef.current = new Set(initialPlayedKeys ?? []);
  const playedKeys = playedKeysRef.current;

  const itemKeys = items.map((item, index) => getKey(item, index));
  // getKey·items 참조가 렌더마다 바뀌어도 키 구성이 같으면 다시 계산하지 않는다
  const keySignature = itemKeys.join('\n');
  const enteringIndexByKey = useMemo(
    () => new Map(itemKeys.filter((key) => !playedKeys.has(key)).map((key, index) => [key, index])),
    // keySignature가 itemKeys를 대신한다
    [keySignature, playedKeys],
  );
  // 기존 행이 있는 상태에서 신규만 들어오면 기다리지 않는다
  const isPartialEntrance = enteringIndexByKey.size > 0 && enteringIndexByKey.size < itemKeys.length;
  const effectiveDelayChildren = isPartialEntrance ? 0 : delayChildren;

  useEffect(() => {
    if (!shouldAnimate) {
      keySignature.split('\n').forEach((key) => playedKeys.add(key));
      return;
    }
    if (enteringIndexByKey.size === 0) return;
    const timer = window.setTimeout(
      () => enteringIndexByKey.forEach((_, key) => playedKeys.add(key)),
      calcEntranceCompleteMs(enteringIndexByKey.size, effectiveDelayChildren, staggerChildren),
    );
    return () => window.clearTimeout(timer);
  }, [effectiveDelayChildren, enteringIndexByKey, keySignature, playedKeys, shouldAnimate, staggerChildren]);

  if (!shouldAnimate) {
    return (
      <ul className={className} aria-label={ariaLabel}>
        {items.map((item, index) => (
          <li key={itemKeys[index]} className={itemClassName}>
            {renderItem(item, index)}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <ul className={className} aria-label={ariaLabel}>
      {/* 다시 마운트돼도 신규 키는 입장해야 하므로 AnimatePresence initial={false} 금지. 스킵은 행별 initial={false}로 한다 */}
      <AnimatePresence>
        {items.map((item, index) => {
          const key = itemKeys[index] ?? String(index);
          const enteringIndex = enteringIndexByKey.get(key);
          const delay = enteringIndex == null ? 0 : staggerDelay(enteringIndex, effectiveDelayChildren, staggerChildren);

          return (
            <motion.li
              key={key}
              layout="position"
              className={itemClassName}
              initial={enteringIndex == null ? false : { opacity: 0, y: slideUpY, height: 'auto' }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, height: 0, y: LIST_EXIT_Y, transition: LIST_EXIT_TRANSITION }}
              transition={itemTransition(delay)}
              style={ITEM_STYLE}
            >
              {renderItem(item, index)}
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ul>
  );
}
