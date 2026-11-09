'use client';

import type { ReactNode } from 'react';

import { PAGE_ENTRANCE_DELAY_CHILDREN_S, PAGE_ENTRANCE_STAGGER_S } from './pageEntranceMotion';
import { StaggeredEntrance, StaggeredEntranceItem } from './StaggeredEntrance';

interface PageStaggerEntranceProps {
  children: ReactNode;
  /** 스태거 간격(초). 기본 0.045 */
  staggerChildren?: number;
  /** 첫 자식 전 delay(초). 기본 0 */
  delayChildren?: number;
  className?: string;
}

/**
 * 화면 본문 블록을 위→아래로 연속 등장시키는 프리셋.
 * ponytail: 스택 화면은 push 슬라이드가 이미 있으니 스택 밖 화면(로그인·직원 화면)에서만 쓴다.
 */
export function PageStaggerEntrance({
  children,
  staggerChildren = PAGE_ENTRANCE_STAGGER_S,
  delayChildren = PAGE_ENTRANCE_DELAY_CHILDREN_S,
  className,
}: PageStaggerEntranceProps) {
  return (
    <StaggeredEntrance className={className} staggerChildren={staggerChildren} delayChildren={delayChildren}>
      {children}
    </StaggeredEntrance>
  );
}

interface PageStaggerEntranceItemProps {
  children: ReactNode;
  className?: string;
}

export function PageStaggerEntranceItem({ children, className }: PageStaggerEntranceItemProps) {
  return (
    <StaggeredEntranceItem variant="smoothDown" className={className}>
      {children}
    </StaggeredEntranceItem>
  );
}
