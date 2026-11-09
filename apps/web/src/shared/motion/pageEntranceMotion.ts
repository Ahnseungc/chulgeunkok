import type { Transition } from 'framer-motion';

import { ENTRANCE_STYLE_EASE } from './entranceStyleMotion';

/*
 * 화면 본문 블록 연속 등장 프리셋.
 * ponytail: 화면 전체 슬라이드는 스택 라우터(webviewkit)가 맡으므로 페이지 슬라이드 프리셋은 두지 않는다.
 */
export const PAGE_ENTRANCE_DURATION_S = 0.42;

/** 블록 간 겹침을 두어 끊김 없이 이어지도록 짧게 */
export const PAGE_ENTRANCE_STAGGER_S = 0.045;

export const PAGE_ENTRANCE_DELAY_CHILDREN_S = 0;

export const PAGE_ENTRANCE_Y_OFFSET_PX = 10;

export function pageEntranceTransition(delay = 0, overrides?: Partial<Transition>): Transition {
  return { duration: PAGE_ENTRANCE_DURATION_S, ease: ENTRANCE_STYLE_EASE, delay, ...overrides };
}
