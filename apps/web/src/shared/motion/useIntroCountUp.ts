'use client';

import { useReducedMotion } from 'framer-motion';
import { useRef } from 'react';

import { resolveSmoothCountUpDurationSec, resolveSmoothCountUpIntroFrom } from './smoothCountUp';

export interface IntroCountUp {
  animateFrom: number | undefined;
  durationSec: number;
}

const NO_INTRO: IntroCountUp = { animateFrom: undefined, durationSec: 0 };

type IntroState = { target: number; from: number } | 'done' | null;

/**
 * 화면에 처음 들어온 값만 카운트업한다 (목표의 35%에서 시작).
 * 이후 값이 바뀌면(폴링·되살아난 화면 재조회) 애니메이션 없이 바로 바꾸고, 다시 재생하지 않는다.
 * ponytail: 기존 useSmoothCountUp(값이 바뀔 때마다 이어서 카운트업)은 폴링 화면에서 숫자가 계속 움직여 대신 이걸 둔다.
 */
export function useIntroCountUp(target: number | null | undefined): IntroCountUp {
  const reduceMotion = useReducedMotion();
  const introRef = useRef<IntroState>(null);

  if (target == null) return NO_INTRO;
  if (introRef.current === null) {
    introRef.current = reduceMotion ? 'done' : { target, from: resolveSmoothCountUpIntroFrom(target) };
  }

  const intro = introRef.current;
  if (intro === 'done') return NO_INTRO;
  if (intro.target !== target) {
    introRef.current = 'done';
    return NO_INTRO;
  }
  return { animateFrom: intro.from, durationSec: resolveSmoothCountUpDurationSec(intro.from, target) };
}
