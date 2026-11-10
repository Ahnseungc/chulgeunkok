'use client';

import { Text } from '@seed-design/react';
import { motion, useReducedMotion } from 'framer-motion';
import type { Route } from 'next';
import Link from 'next/link';
import { useEffect, useRef, useState, type RefObject } from 'react';

import {
  SCREEN_HEADER_DIVIDER_HIDDEN,
  SCREEN_HEADER_DIVIDER_SHOWN,
  SCREEN_HEADER_REDUCED_TRANSITION,
  SCREEN_HEADER_TITLE_HIDDEN,
  SCREEN_HEADER_TITLE_SHOWN,
  screenHeaderTransition,
} from '@/shared/motion/screenHeaderMotion';

import { AppBackLink } from './AppLink';

const CHEVRON_BACK = (
  <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M15 18l-6-6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

interface ScreenHeaderProps<T extends string> {
  /** 뒤로 갈 상위 화면 */
  backHref: Route<T>;
  /** 상위 화면 이름 (뒤로가기 접근 가능한 이름) */
  backLabel: string;
  /** 바 가운데 작은 제목. 본문 큰 제목(h1)과 같은 문구. 아직 모르면 비워 둔다 */
  title?: string;
  /** 스택 밖 화면으로 나간다 (매장 홈 → `/owner`). 스택 back 대신 next/link 로 이동 */
  leaveStack?: boolean;
}

/**
 * 화면 상단 앱 바 — 뒤로가기 + 스크롤 시 나타나는 작은 제목 (iOS large title).
 * `<main className="screen">` 맨 위에 두고, 같은 main 안의 첫 h1 을 큰 제목으로 본다.
 */
export default function ScreenHeader<T extends string>({ backHref, backLabel, title, leaveStack = false }: ScreenHeaderProps<T>) {
  const barRef = useRef<HTMLElement>(null);
  const collapsed = useLargeTitleScrolledAway(barRef, title);
  const shouldReduceMotion = useReducedMotion();
  const transition = shouldReduceMotion ? SCREEN_HEADER_REDUCED_TRANSITION : screenHeaderTransition();
  const backProps = { href: backHref, className: 'screen-header__back', 'aria-label': `뒤로 가기, ${backLabel}` };

  return (
    <header ref={barRef} className="screen-header" data-collapsed={collapsed}>
      {leaveStack ? <Link {...backProps}>{CHEVRON_BACK}</Link> : <AppBackLink {...backProps}>{CHEVRON_BACK}</AppBackLink>}
      {/* 큰 제목(h1)과 같은 문구라 보조기기에는 한 번만 읽히게 숨긴다 */}
      <motion.span
        className="screen-header__title"
        aria-hidden="true"
        initial={false}
        animate={collapsed ? SCREEN_HEADER_TITLE_SHOWN : SCREEN_HEADER_TITLE_HIDDEN}
        transition={transition}
      >
        <Text textStyle="t5Bold">{title}</Text>
      </motion.span>
      <motion.span
        className="screen-header__divider"
        aria-hidden="true"
        initial={false}
        animate={collapsed ? SCREEN_HEADER_DIVIDER_SHOWN : SCREEN_HEADER_DIVIDER_HIDDEN}
        transition={transition}
      />
    </header>
  );
}

/**
 * 큰 제목이 바 밑으로 완전히 올라가면 true. 스크롤 리스너 없이 IntersectionObserver 하나로 본다.
 * root 는 뷰포트 — 스택 페이지(overflow: auto)·window 스크롤 둘 다 조상 스크롤 영역에 잘린 교차로 계산된다.
 * ponytail: 스크롤 영역이 화면 맨 위에서 시작한다고 보고 바 높이만큼만 rootMargin 을 뺀다. 바 위에 다른 고정 영역이 생기면 root 를 스크롤 조상으로 바꾼다.
 */
function useLargeTitleScrolledAway(barRef: RefObject<HTMLElement | null>, title: string | undefined): boolean {
  const [scrolledAway, setScrolledAway] = useState(false);

  useEffect(() => {
    const bar = barRef.current;
    // 큰 제목은 데이터가 온 뒤 그려지는 화면이 있어 제목이 바뀔 때마다 다시 찾는다
    const largeTitle = bar?.parentElement?.querySelector('h1');
    if (!bar || !largeTitle || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        // 위로 지나간 경우만 축소. 스택 전환 중 가로로 화면 밖에 있을 때(교차 없음)는 펼친 채 둔다
        const rootTop = entry.rootBounds?.top ?? 0;
        setScrolledAway(!entry.isIntersecting && entry.boundingClientRect.top < rootTop);
      },
      { rootMargin: `-${bar.offsetHeight}px 0px 0px 0px` },
    );
    observer.observe(largeTitle);
    return () => observer.disconnect();
  }, [barRef, title]);

  return scrolledAway;
}
