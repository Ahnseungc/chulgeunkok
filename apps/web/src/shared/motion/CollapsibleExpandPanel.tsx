'use client';

import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';

import { COLLAPSIBLE_HEIGHT_CONTENT_VARIANTS, COLLAPSIBLE_HEIGHT_TRANSITION, COLLAPSIBLE_PRESENCE_INITIAL } from './collapsibleHeightMotion';

const TREE_LINE_FADE_S = 0.15;
const PANEL_STYLE = { overflow: 'hidden' } as const;
const CONTENT_STYLE = { position: 'relative' } as const;
const TREE_LINE_STYLE = {
  position: 'absolute',
  top: 0,
  left: 16,
  width: 1,
  height: '100%',
  background: 'var(--seed-color-stroke-neutral-muted)',
  transformOrigin: 'top center',
} as const;

interface CollapsibleExpandPanelProps {
  isOpen: boolean;
  children: ReactNode;
  /** 펼침 시 왼쪽 세로선이 위→아래로 그려지는 효과 */
  showTreeLine?: boolean;
  className?: string;
  contentClassName?: string;
  id?: string;
}

/**
 * 접기/펼치기 패널 — 높이 트윈. 처음 그릴 땐 현재 상태로 바로 그린다.
 * 접힌 상태에선 aria-hidden·inert 로 스크린리더와 포커스에서 뺀다.
 */
export function CollapsibleExpandPanel({ isOpen, children, showTreeLine = false, className, contentClassName, id }: CollapsibleExpandPanelProps) {
  const reducedMotion = useReducedMotion();
  const instant = reducedMotion ? { duration: 0 } : undefined;

  return (
    <motion.div
      id={id}
      initial={COLLAPSIBLE_PRESENCE_INITIAL}
      animate={isOpen ? 'open' : 'closed'}
      variants={COLLAPSIBLE_HEIGHT_CONTENT_VARIANTS}
      transition={instant}
      className={className}
      style={PANEL_STYLE}
      aria-hidden={!isOpen}
      inert={!isOpen}
    >
      <div className={contentClassName} style={CONTENT_STYLE}>
        {showTreeLine ? (
          <motion.div
            aria-hidden
            initial={false}
            animate={{ scaleY: isOpen ? 1 : 0, opacity: isOpen ? 1 : 0 }}
            transition={instant ?? { scaleY: COLLAPSIBLE_HEIGHT_TRANSITION, opacity: { duration: TREE_LINE_FADE_S } }}
            style={TREE_LINE_STYLE}
          />
        ) : null}
        {children}
      </div>
    </motion.div>
  );
}
