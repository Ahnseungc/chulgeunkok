import type { Target, Transition } from 'framer-motion';

import { ENTRANCE_STYLE_DURATION, ENTRANCE_STYLE_EASE } from './entranceStyleMotion';

/*
 * 앱 바(shared/ui/ScreenHeader) 축소 제목·구분선 — 큰 제목이 바 밑으로 사라지면 나타나고, 돌아오면 숨는다.
 * iOS large title 처럼 작은 제목은 아래에서 살짝 올라온다.
 */
export const SCREEN_HEADER_TITLE_HIDDEN: Target = { opacity: 0, y: 4 };
export const SCREEN_HEADER_TITLE_SHOWN: Target = { opacity: 1, y: 0 };

export const SCREEN_HEADER_DIVIDER_HIDDEN: Target = { opacity: 0 };
export const SCREEN_HEADER_DIVIDER_SHOWN: Target = { opacity: 1 };

/** 모션 줄이기: 즉시 전환 */
export const SCREEN_HEADER_REDUCED_TRANSITION: Transition = { duration: 0 };

export function screenHeaderTransition(): Transition {
  return { duration: ENTRANCE_STYLE_DURATION.child, ease: ENTRANCE_STYLE_EASE };
}
