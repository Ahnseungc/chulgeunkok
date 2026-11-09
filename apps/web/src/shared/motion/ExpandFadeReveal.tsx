'use client';

import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';

const REVEAL_TRANSITION = { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] as const };
const CLIP_STYLE = { overflow: 'hidden' } as const;

interface ExpandFadeRevealProps {
  children: ReactNode;
  /** 펼친 뒤 위 여백(px) */
  revealTopPadding?: number;
  className?: string;
}

/**
 * 높이 0에서 펼치며 나타나는 블록. 뒤늦게 도착한 안내·배너가 화면을 툭 밀지 않게 할 때 쓴다.
 * 사라질 때도 접으려면 AnimatePresence로 감싼다.
 */
export function ExpandFadeReveal({ children, revealTopPadding = 0, className }: ExpandFadeRevealProps) {
  const reducedMotion = useReducedMotion();

  if (reducedMotion) {
    return (
      <div className={className} style={{ paddingTop: revealTopPadding }}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      initial={{ height: 0, opacity: 0, paddingTop: 0 }}
      animate={{ height: 'auto', opacity: 1, paddingTop: revealTopPadding }}
      exit={{ height: 0, opacity: 0, paddingTop: 0 }}
      transition={REVEAL_TRANSITION}
      className={className}
      style={CLIP_STYLE}
    >
      {children}
    </motion.div>
  );
}
