'use client';

import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';

import { ENTRANCE_STYLE_DURATION, ENTRANCE_STYLE_EASE } from './entranceStyleMotion';

const DEFAULT_Y_PX = 8;
const DEFAULT_REPEAT_DURATION_S = 2.2;
const REPEAT_DELAY_S = 0.3;
/** 반복 모드: 나타남 → 머무름 → 사라짐 구간 비율 */
const REPEAT_KEYFRAME_TIMES = [0, 0.2, 0.75, 1];

interface TextEntranceProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  /** true면 나타났다 사라지기를 반복한다 (로딩 문구용) */
  repeat?: boolean;
  repeatDuration?: number;
}

/** 로딩·안내 문구에 재사용하는 텍스트 등장 애니메이션 */
export function TextEntrance({
  children,
  className,
  delay = 0,
  y = DEFAULT_Y_PX,
  repeat = false,
  repeatDuration = DEFAULT_REPEAT_DURATION_S,
}: TextEntranceProps) {
  const reducedMotion = useReducedMotion();

  if (reducedMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      animate={repeat ? { opacity: [0, 1, 1, 0], y: [y, 0, 0, -y] } : { opacity: 1, y: 0 }}
      transition={
        repeat
          ? { delay, duration: repeatDuration, times: REPEAT_KEYFRAME_TIMES, ease: 'easeInOut', repeat: Infinity, repeatDelay: REPEAT_DELAY_S }
          : { delay, duration: ENTRANCE_STYLE_DURATION.list, ease: ENTRANCE_STYLE_EASE }
      }
      style={{ willChange: 'transform, opacity' }}
    >
      {children}
    </motion.div>
  );
}
