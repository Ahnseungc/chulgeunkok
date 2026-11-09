---
name: commit-after-task-complete
description: >-
  출근콕 작업 종료 마무리: pnpm typecheck / pnpm test 검증 → git status → 의도한 파일만 add →
  작성자(Ahnseungc noreply) 확인 → feat: 한글 커밋. 푸시는 요청 시만.
  Triggers: 작업 끝, 완료, 커밋, 커밋 남겨, 끝나면 커밋.
---

# 작업 완료 — 검증 + 커밋

규칙: `.cursor/rules/git-commit-after-task.mdc` · `.cursor/rules/commit-convention.mdc`

## 언제

파일 변경이 생긴 요청의 마지막. 질문만 한 턴은 커밋하지 않는다.

## 순서

1. 검증

```bash
pnpm typecheck
pnpm test            # 관련 파일만이면 pnpm --filter @chulgeunkok/web test -- <path>
```

UI 변경이면 `pnpm dev` 로 화면 확인 (앱 셸 관련이면 `pnpm --filter @chulgeunkok/mobile ios`).

2. 작성자

```bash
git config user.name    # 안승찬
git config user.email   # 94547692+Ahnseungc@users.noreply.github.com
```

다르면(특히 회사 계정) 커밋하지 말고 알린다.

3. 범위

```bash
git status --short
git diff --stat
```

다른 에이전트·사용자가 같은 트리에서 작업 중일 수 있다. 내 변경만 고른다.

4. 스테이징 — 경로를 명시한다. `git add -A` / `git add .` 금지, `.env*` 금지.

```bash
git add apps/web/src/features/staff docs/specs/staff/README.md
```

5. 커밋

```bash
git commit -F - <<'MSG'
feat: 직원 상세에 근로조건 이력 추가
MSG
```

`index.lock` 오류면 몇 초 뒤 다시. lock 파일을 지우지 않는다.

6. 알림 — 해시 + 메시지 한 줄. 푸시는 요청 시 (`git-push-build-first`).

## 워크트리

브랜치를 나눠 작업 중이면 그 워크트리 경로에서 검증·커밋한다. 메인 체크아웃의 브랜치를 바꾸지 않는다.
