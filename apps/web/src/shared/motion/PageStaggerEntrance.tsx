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
 * 스택 화면은 push 슬라이드가 이미 있으니 바로 보이는 골격(제목·뒤로가기)엔 쓰지 않고, 데이터가 와서 처음 그려지는 블록에만 쓴다.
 * 마운트할 때 한 번만 재생한다 — 되살아남(keepAlive)·폴링으로 값이 바뀌어도 다시 재생하지 않는다.
 * `.screen` 의 gap 을 그대로 쓰려면 `className="motion-contents"` (display: contents).
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
