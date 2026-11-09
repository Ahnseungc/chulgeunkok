---
name: git-push-build-first
description: >-
  푸시 요청(git-push, push 해줘, 푸시) 시 작성자 확인 → pnpm typecheck → pnpm test → pnpm build 를 통과시킨 뒤 git push.
  실패하면 고치고 다시. 커밋은 요청 시만. main 에 force push 금지.
---

# Git push — 검증 후 푸시

규칙: `.cursor/rules/git-push-build-first.mdc`

## 1. 사전 확인

```bash
git status
git branch -vv
git log @{u}..HEAD --format='%h %an <%ae> %s'   # upstream 없으면 git log origin/main..HEAD
```

- 미커밋 변경은 push 에 안 들어간다고 알린다.
- 작성자가 전부 `안승찬 <94547692+Ahnseungc@users.noreply.github.com>` 인지. 회사 계정 커밋이 하나라도 있으면 멈추고 알린다 (작성자 수정은 사용자 동의 후).

## 2. 검증 (순서대로, 실패 시 push 금지)

```bash
pnpm typecheck
pnpm test
pnpm build
```

실패 → 첫 오류부터 최소 수정 → 다시. 같은 오류 반복이면 멈추고 보고.

## 3. push

```bash
git push                    # upstream 있음
git push -u origin HEAD     # 없음
```

rebase 한 기능 브랜치만 `--force-with-lease`. `main` 에 `--force` 금지. `git config` 변경 금지.

## 4. 보고 (한국어)

검증 결과(수정한 파일), push 브랜치·결과.
