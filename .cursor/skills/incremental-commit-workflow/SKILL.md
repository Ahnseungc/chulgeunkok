---
name: incremental-commit-workflow
description: >-
  출근콕에서 큰 기능·리팩터를 의미 있는 여러 커밋으로 나눈다 (feat/refactor/test 분리, 마이그레이션은 쓰는 코드와 함께,
  스펙 수정은 동작 커밋과 함께). Triggers: 큰 작업, 커밋 나누기, 쪼개서 커밋, incremental commit, large PR.
---

# 큰 작업 — 커밋 분할

규칙 원본: `.cursor/rules/git-incremental-commits.mdc`

## 계획 (구현 전 짧게 제안)

예: 새 도메인 기능

1. `refactor: <공용 헬퍼 추출>` — 동작 변화 없음 (필요할 때만)
2. `feat: <도메인> 스키마·서비스와 테스트` — `schema.ts`, `server/*`, `*.test.ts`, 마이그레이션, 스펙
3. `feat: <도메인> API 라우트`
4. `feat: <도메인> 화면` — `ui/*`, `OwnerStackApp`, `app/**/page.tsx`, `globals.css`

작으면 2~4를 하나로 묶어도 된다 (기존 히스토리도 기능당 한 커밋이 많다).

## 각 커밋 전

```bash
pnpm typecheck
git add <이 커밋의 경로만>
git diff --cached --stat
```

## 피하기

- 한 줄마다 커밋, `WIP` 메시지
- 스키마는 바뀌었는데 코드가 다음 커밋에 있는 중간 상태
