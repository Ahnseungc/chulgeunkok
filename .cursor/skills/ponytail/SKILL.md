---
name: ponytail
description: >-
  Lazy senior / minimum-diff mode for 출근콕 (chulgeunkok): YAGNI ladder before any code,
  reuse existing helpers first, no unrequested abstractions, deletion over
  addition, shortest correct diff after understanding the full flow, root-cause
  bug fixes, ponytail: comments for intentional shortcuts. MANDATORY — read and
  apply this skill BEFORE writing or editing any code (TS/TSX/JS, hooks,
  services, UI, tests, refactor, bugfix, feature). Use when implementing,
  fixing, refactoring, coding, editing files, 코드 작성, 구현, 수정, 리팩터,
  버그, 최소 변경, YAGNI, 포니테일, ponytail.
---

# Ponytail — 최소 코드 스킬

원본 규칙: `.cursor/rules/ponytail.mdc`

> **코드를 한 줄이라도 쓰기 전에 이 스킬을 읽고 사다리를 탄다.**  
> Lazy = 효율. 부주의가 아니다. 가장 좋은 코드는 쓰지 않은 코드다.

## 언제 적용하나 (예외 없음)

- 기능 구현·버그 수정·리팩터·테스트 추가
- TS/TSX, 훅, 서버 서비스, 화면, Prisma 스키마, RN 셸, 설정 파일 수정
- “조금만”, “임시로”, “나중에 정리” 포함 — 전부 동일 기준

`clean-code-quality` / `exception-handling`과 **함께** 쓴다.  
충돌 시: 품질·예외 가드는 유지하고, **불필요한 추상화·파일·보일러플레이트만** 줄인다.

## 에이전트 워크플로 (순서 고정)

### 0) 이해 먼저 (사다리 전)

```
이해:
- [ ] 요청·증상 전체 읽음
- [ ] 건드리는 코드의 실제 흐름을 end-to-end로 추적함
- [ ] 같은 함수/유틸의 다른 호출부도 grep 함 (버그면 특히)
```

작은 diff라도 흐름을 모르면 lazy가 아니라 두 번째 버그다.

### 1) 사다리 — 걸리는 첫 칸에서 멈춤

1. 아예 안 만들어도 되나? (YAGNI)
2. 이 코드베이스에 이미 있나? → 재사용 (다시 쓰지 말 것). 먼저 볼 곳: `apps/web/src/shared/{lib,ui,schema,motion}`, `apps/web/src/server/`, 같은 도메인 `features/<domain>/`, `packages/app-bridge`
3. 표준 라이브러리로 되나?
4. 네이티브/플랫폼 기능으로 되나?
5. 이미 설치된 의존성으로 되나? (Seed, webviewkit, es-toolkit, zod, framer-motion)
6. 한 줄로 되나? → 한 줄
7. 그제야: **동작하는 최소 코드**

### 2) 작성 규칙

- 요청받지 않은 추상화 금지
- 새 의존성 가능하면 금지
- 아무도 안 시킨 보일러플레이트 금지
- 추가보다 삭제. 똑똑함보다 지루함. 파일 수 최소
- 짧은 올바른 diff가 이김 — 잘못된 곳의 작은 변경은 패배
- 복잡한 요청은 질문: “X가 진짜 필요한가, Y로 되나?”
- stdlib 두 방법이 비슷한 길이면 **엣지케이스 맞는 쪽** (덜 부실한 알고리즘)
- 의도적 단순화는 `ponytail:` 주석. 한계(전역 락, O(n²) 등)와 업그레이드 경로를 적음

### 3) 버그 = 증상 패치 금지

- 티켓이 가리킨 경로만 고치지 말 것
- 공유 함수에 가드 한 번이, 호출부마다 패치보다 작다
- 형제 호출부가 같은 버그를 남기지 않게 grep

### 4) 게을러지면 안 되는 것

문제 이해 · trust boundary 검증 · 데이터 손실 막는 에러 처리 · 보안 · a11y ·  
실기기 보정 · 사용자가 명시한 요구.

비사소 로직은 **실패하면 깨지는 runnable check 1개**를 남긴다  
(작은 vitest `*.test.ts` — 서비스면 `createTestDb()`). 한 줄짜리 trivial은 테스트 불필요.

## 빠른 체크리스트 (코드 쓰기 직전)

```
Ponytail:
- [ ] 흐름 이해 완료
- [ ] 사다리 1–6에서 멈출 수 없었음 → 7만 진행
- [ ] 기존 헬퍼/패턴 재사용 검토함
- [ ] 새 파일·추상화·의존성이 정말 필요한가?
- [ ] diff가 최소이면서 올바른 위치인가?
- [ ] 버그면 공유 루트 원인 수정인가?
- [ ] 비사소면 체크 1개 있는가?
```

하나라도 아니면 코드를 쓰지 말고 다시 0)부터.

## 관련

- `.cursor/rules/ponytail.mdc`
- `.cursor/skills/clean-code-quality/SKILL.md` (품질·DoD)
- `.cursor/skills/exception-handling/SKILL.md` (실패 경로)
