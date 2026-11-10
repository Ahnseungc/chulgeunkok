'use client';

import type { ReactNode } from 'react';

import { StaggeredEntrance, StaggeredEntranceItem } from './StaggeredEntrance';

/** 출퇴근마다 보는 화면이라 짧게 이어서 */
const SUCCESS_STAGGER_S = 0.06;
const SUCCESS_DELAY_S = 0;
/** 콕 마크가 이 크기에서 톡 커진다 */
const SUCCESS_MARK_SCALE_FROM = 0.6;

interface SuccessEntranceProps {
  children: ReactNode;
}

/**
 * 완료 화면(콕! 출근 완료·등록 완료·매장 QR 준비) — 마크가 톡 커지고 문구가 이어서 올라온다. 마운트할 때 한 번만 재생한다.
 * 루트는 `.motion-contents`(display: contents) 라 부모 `.punch-center` 의 가운데 정렬·gap 을 그대로 쓴다.
 */
export function SuccessEntrance({ children }: SuccessEntranceProps) {
  return (
    <StaggeredEntrance className="motion-contents" staggerChildren={SUCCESS_STAGGER_S} delayChildren={SUCCESS_DELAY_S}>
      {children}
    </StaggeredEntrance>
  );
}

interface SuccessEntranceItemProps {
  children: ReactNode;
  className?: string;
}

/** 콕 마크 자리 (`.punch-center__mark` 로 아래 여백) */
export function SuccessEntranceMark({ children, className = 'punch-center__mark' }: SuccessEntranceItemProps) {
  return (
    <StaggeredEntranceItem variant="scaleIn" distance={SUCCESS_MARK_SCALE_FROM} className={className}>
      {children}
    </StaggeredEntranceItem>
  );
}

/** 마크 뒤 문구·버튼 한 덩어리 */
export function SuccessEntranceItem({ children, className }: SuccessEntranceItemProps) {
  return (
    <StaggeredEntranceItem variant="fadeUp" className={className}>
      {children}
    </StaggeredEntranceItem>
  );
}
