'use client';

import { LayoutGroup, motion, useReducedMotion } from 'framer-motion';

import { ENTRANCE_STYLE_DURATION, ENTRANCE_STYLE_EASE } from './entranceStyleMotion';

export const TabUnderlineGroup = LayoutGroup;

/** 탭 라벨 색 전환 — globals.css `.tab-underline-label` */
export const TAB_UNDERLINE_LABEL_CLASS = 'tab-underline-label';

interface TabUnderlineProps {
  layoutId: string;
  selected: boolean;
}

/** 활성 탭 언더라인. 같은 `layoutId`를 쓰는 탭끼리 미끄러지듯 이동한다 (색은 currentColor) */
export function TabUnderline({ layoutId, selected }: TabUnderlineProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <span className="tab-underline" aria-hidden>
      {selected ? (
        <motion.span
          layoutId={layoutId}
          className="tab-underline__bar"
          transition={shouldReduceMotion ? { duration: 0 } : { duration: ENTRANCE_STYLE_DURATION.container, ease: ENTRANCE_STYLE_EASE }}
        />
      ) : null}
    </span>
  );
}
