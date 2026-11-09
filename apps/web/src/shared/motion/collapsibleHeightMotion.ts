import type { Transition, Variants } from 'framer-motion';

/** 접기/펼치기 높이 트윈 */
export const COLLAPSIBLE_HEIGHT_TRANSITION: Transition = {
  type: 'tween',
  duration: 0.35,
  ease: [0.32, 0.72, 0, 1],
};

/** 처음 그릴 때 접힘·펼침 트윈을 재생하지 않는다 */
export const COLLAPSIBLE_PRESENCE_INITIAL = false;

/** height:auto ↔ 0 + 페이드 variants */
export const COLLAPSIBLE_HEIGHT_CONTENT_VARIANTS: Variants = {
  open: {
    height: 'auto',
    opacity: 1,
    transition: { height: COLLAPSIBLE_HEIGHT_TRANSITION, opacity: { duration: 0.3 } },
  },
  closed: {
    height: 0,
    opacity: 0,
    transition: { height: COLLAPSIBLE_HEIGHT_TRANSITION, opacity: { duration: 0.25 } },
  },
};
