---
name: animation-reuse-first
description: >-
  애니메이션·framer-motion 을 추가하기 전에 apps/web/src/shared/motion/ 의 공용 컴포넌트·프리셋을 찾아
  재사용하거나 감싸고, 없을 때만 만든다. Triggers: 애니메이션, 모션, framer-motion, 등장, stagger,
  카운트업, 공통 애니메이션, motion.
---

# 애니메이션 — 공용 먼저

규칙 원본: `.cursor/rules/animation-reuse-first.mdc`

## 1. 필요한가

- webviewkit 스택 전환과 겹치지 않는가?
- CSS `transition` + Seed `--seed-duration-*` 로 되는가? 되면 그걸로.

## 2. 찾기

```bash
ls apps/web/src/shared/motion
grep -rln "Entrance\|Stagger\|CountUp\|Collapse\|Reveal" apps/web/src/shared/motion apps/web/src/features
```

역할로 고른다:

| 필요 | 먼저 볼 것 |
|------|-----------|
| 제목·문단 등장 | `TitleEntrance`, `TextEntrance`, `Entrance` |
| 카드·목록 순차 등장 | `StaggeredEntrance`, `CardStaggerList`, `PageStaggerEntrance` |
| 숫자 변화 | `AnimatedNumber`, `SmoothCountUpNumber`, `useIntroCountUp` |
| 펼침·접힘 | `CollapsibleExpandPanel`, `ExpandFadeReveal`, `collapsibleHeightMotion.ts` |
| 탭 밑줄 | `TabUnderline` |
| 시트 | `sheetMotion.ts` |
| 이징·타이밍 상수 | `easing.ts`, `entranceStyleMotion.ts`, `pageEntranceMotion.ts` |

(폴더 구성은 정리 중일 수 있다. 위 표보다 `ls` 결과가 우선.)

## 3. 없으면

- 한 화면: `features/<domain>/ui/<Name>Motion.tsx`, 상수는 `shared/motion` 것을 import.
- 두 화면 이상: `shared/motion/` 에 추가 (+ 순수 계산은 `*.test.ts`).
- `'use client'`, `useReducedMotion` 처리.
