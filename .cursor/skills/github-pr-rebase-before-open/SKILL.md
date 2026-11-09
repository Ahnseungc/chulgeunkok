---
name: github-pr-rebase-before-open
description: >-
  출근콕 PR 생성·갱신 전 head 를 origin/main 에 rebase 하고 force-with-lease push. merge 커밋으로 충돌 해결 금지.
  Triggers: PR, 풀리퀘, rebase, PR 올려, main 최신 반영.
---

# PR 전 rebase — 스킬

원본 규칙: `.cursor/rules/github-pr-rebase-before-open.mdc`

## 순서

```bash
git fetch origin main <head>
# head 브랜치 워크트리에서 (메인 체크아웃 브랜치 전환 대신 워크트리 권장)
git rebase origin/main
# 충돌: 수정 → git add → git rebase --continue
git log origin/main..HEAD --oneline
git diff origin/main HEAD --stat
pnpm typecheck && pnpm test
git push --force-with-lease origin <head>
gh pr create --base main --head <head> --body-file <파일>
```

## head 에 main 과 겹치는 커밋이 많을 때

```bash
git checkout -B <head> origin/main
git cherry-pick <고유-커밋...>
git push --force-with-lease origin <head>
```

## 금지

- `git merge origin/main` 으로 head 에 merge 커밋
- `main` 에 force push
- 작성자가 회사 계정인 커밋을 그대로 push (`commit-convention.mdc` §1)
