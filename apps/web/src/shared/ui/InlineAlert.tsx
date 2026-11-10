'use client';

import { Text } from '@seed-design/react';
import { AnimatePresence } from 'framer-motion';
import type { ComponentProps } from 'react';

import { ExpandFadeReveal } from '@/shared/motion/ExpandFadeReveal';

/** 뒤늦게 펼쳐지는 블록 래퍼 클래스 (globals.css `.flow-reveal`) — ExpandFadeReveal 의 className 으로 */
export const FLOW_REVEAL_CLASS = 'flow-reveal';
/** `.flow-reveal` 의 끌어올림과 같은 값 — ExpandFadeReveal 의 revealTopPadding 으로 */
export const FLOW_REVEAL_GAP_PX = 12;

type TextProps = ComponentProps<typeof Text>;

interface InlineAlertProps {
  /** 비면 접혀 사라진다 */
  message: string | null | undefined;
  textStyle?: TextProps['textStyle'];
  color?: TextProps['color'];
  /** 실패는 alert, 저장 완료 같은 결과는 status */
  role?: 'alert' | 'status';
}

/**
 * 화면 안 오류·결과 문구. 뒤늦게 생겨도 아래 내용을 툭 밀지 않고 펼치며 나타나고, 사라질 때 접힌다.
 * 처음 그릴 때 이미 문구가 있으면 펼침 없이 바로 보인다.
 */
export default function InlineAlert({ message, textStyle = 't5Regular', color = 'fg.critical', role = 'alert' }: InlineAlertProps) {
  return (
    <AnimatePresence initial={false}>
      {message ? (
        <ExpandFadeReveal key="inline-alert" className={FLOW_REVEAL_CLASS} revealTopPadding={FLOW_REVEAL_GAP_PX}>
          <Text as="p" textStyle={textStyle} color={color} role={role}>
            {message}
          </Text>
        </ExpandFadeReveal>
      ) : null}
    </AnimatePresence>
  );
}
