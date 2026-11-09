---
name: framer-motion-interaction
description: >-
  출근콕에서 framer-motion 으로 배너·패널·목록 전환을 구현할 때의 실무 절차. 구현 전 animation-reuse-first 를 먼저 따른다.
  Triggers: framer-motion, 애니메이션, 인터랙션, 배너 등장, 높이 애니메이션, motion.
---

# Framer Motion 인터랙션 — 스킬

규칙 원본: `.cursor/rules/framer-motion-interaction.mdc` · 공용 우선: `.cursor/skills/animation-reuse-first/SKILL.md`

## 절차

1. 의미 정의: 어떤 상태 전환(노출·성공·실패)을 알리는가. 없으면 모션 생략.
2. `shared/motion/` 에서 고르기. 없으면 래퍼 컴포넌트(`*Motion.tsx`)로 분리.
3. 값: duration 0.2~0.35s, ease `[0.22, 1, 0.36, 1]` 또는 `shared/motion/easing.ts`.
4. 높이 전환은 `overflow: hidden` 부모 + `collapsibleHeightMotion`.
5. `useReducedMotion()` 이면 즉시 표시.
6. 확인: 브라우저 + RN WebView 에서 하단 CTA·시트가 밀리지 않는지, 저사양 Android 에서 끊기지 않는지.

## 예

```tsx
'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

const EASE = [0.22, 1, 0.36, 1] as const;

export default function UnresolvedBannerMotion({ open, children }: { open: boolean; children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          initial={reduce ? false : { opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? undefined : { opacity: 0, y: -8 }}
          transition={{ duration: 0.25, ease: EASE }}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
```
