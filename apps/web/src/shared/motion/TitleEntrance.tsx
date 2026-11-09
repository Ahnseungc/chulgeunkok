'use client';

import { createContext, type ElementType, type ReactNode, useContext } from 'react';

import { StaggeredEntrance, StaggeredEntranceItem } from './StaggeredEntrance';

/** 타이틀 줄 단위 스태거 */
export const TITLE_ENTRANCE_STAGGER_CHILDREN_S = 0.08;
export const TITLE_ENTRANCE_DELAY_CHILDREN_S = 0.05;

const LINE_STYLE = { display: 'block' } as const;

const TitleEntranceAnimateContext = createContext(true);

interface TitleEntranceProps {
  children: ReactNode;
  className?: string;
  /** 시맨틱 태그. 기본 h2 */
  as?: ElementType;
  staggerChildren?: number;
  delayChildren?: number;
  /** false면 입장 모션 없이 즉시 표시 (다시 마운트될 때 재생을 막을 때) */
  animate?: boolean;
}

/**
 * 다줄 타이틀 등장. 줄마다 아래에서 살짝 올라오며 순차 등장한다.
 *
 * @example
 * <TitleEntrance>
 *   <TitleEntranceLine>오늘 출근한 직원을</TitleEntranceLine>
 *   <TitleEntranceLine>확인해 주세요</TitleEntranceLine>
 * </TitleEntrance>
 */
export function TitleEntrance({
  children,
  className,
  as: Tag = 'h2',
  staggerChildren = TITLE_ENTRANCE_STAGGER_CHILDREN_S,
  delayChildren = TITLE_ENTRANCE_DELAY_CHILDREN_S,
  animate = true,
}: TitleEntranceProps) {
  return (
    <TitleEntranceAnimateContext.Provider value={animate}>
      <Tag className={className}>
        {animate ? (
          <StaggeredEntrance staggerChildren={staggerChildren} delayChildren={delayChildren}>
            {children}
          </StaggeredEntrance>
        ) : (
          children
        )}
      </Tag>
    </TitleEntranceAnimateContext.Provider>
  );
}

interface TitleEntranceLineProps {
  children: ReactNode;
  className?: string;
}

/** 타이틀 한 줄 — fadeUp 스태거 아이템 */
export function TitleEntranceLine({ children, className }: TitleEntranceLineProps) {
  const animate = useContext(TitleEntranceAnimateContext);
  if (!animate) {
    return (
      <div className={className} style={LINE_STYLE}>
        {children}
      </div>
    );
  }
  return (
    <StaggeredEntranceItem variant="fadeUp" className={className}>
      {children}
    </StaggeredEntranceItem>
  );
}
