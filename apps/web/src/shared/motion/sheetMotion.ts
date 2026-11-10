import type { Transition } from 'framer-motion';

/** 시트 올라옴 — iOS 시트에 가까운 감속 곡선 */
export const SHEET_ENTER_TRANSITION: Transition = { type: 'tween', duration: 0.32, ease: [0.32, 0.72, 0, 1] };
/** 닫힘은 조금 짧게, 끝으로 갈수록 빨라지게 */
export const SHEET_EXIT_TRANSITION: Transition = { type: 'tween', duration: 0.22, ease: [0.4, 0, 1, 1] };
export const SHEET_BACKDROP_TRANSITION: Transition = { duration: 0.22, ease: 'easeOut' };
export const SHEET_REDUCED_TRANSITION: Transition = { duration: 0 };
/** 열린 시트의 내용 높이가 바뀔 때(늦게 오는 데이터·오류 문구) 늘고 주는 속도. CSS transition 용 */
export const SHEET_RESIZE_MS = 240;
export const SHEET_RESIZE_EASING = 'cubic-bezier(0.32, 0.72, 0, 1)';

export const SHEET_PANEL_HIDDEN = { y: '100%' } as const;
export const SHEET_PANEL_SHOWN = { y: 0 } as const;
