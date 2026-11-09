---
name: github-pr-description
description: >-
  출근콕 GitHub PR 본문 작성: 실제 줄바꿈 마크다운(--body-file), 요약·스펙·변경 사항·검증·마이그레이션·스크린샷.
  PR 전 github-pr-rebase-before-open 을 먼저 따른다. Use when the user says PR, 풀리퀘, pull request, PR 본문, gh pr create.
---

# GitHub PR 본문 — 스킬

원본 규칙: `.cursor/rules/github-pr-description.mdc`

## 체크리스트

0. rebase 선행: `.cursor/skills/github-pr-rebase-before-open/SKILL.md`
1. 본문을 파일로 쓰고 `gh pr create --base main --body-file <파일>`. `--body` 에 `\n` 문자열 금지.
2. 섹션: 요약 → 스펙 → 변경 사항 → 검증 → 마이그레이션·환경 변수 → 스크린샷.
3. 문장 교정이 필요하면 `stop-slop`.
4. 본문 끝에 도구가 요구하는 생성 표기(attribution)가 있으면 붙인다.

## 예시

```markdown
## 요약

매장 하위 화면을 webviewkit 스택으로 묶어 앱처럼 push·back 한다.

## 스펙

- `docs/specs/<domain>/README.md` §n (바뀐 절)

## 변경 사항

- `features/owner-stack/ui/OwnerStackApp.tsx`: 매장 화면 Activity 등록
- `shared/ui/AppLink.tsx`: 스택 안이면 push, 밖이면 `next/link`

## 검증

- `pnpm typecheck`, `pnpm test`
- iOS 시뮬레이터에서 스와이프 백 확인

## 스크린샷

(브라우저 / 앱)
```
