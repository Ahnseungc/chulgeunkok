---
name: create-skill
description: >-
  출근콕 `.cursor/skills/<name>/SKILL.md` 스킬을 작성한다. 새 스킬, SKILL.md, create skill,
  에이전트 워크플로 문서화 요청 시 사용.
---

# Create Skill (출근콕)

## 위치

```
.cursor/skills/<kebab-name>/
  SKILL.md           # 필수, 500줄 미만
  references/        # 선택, 긴 참고만
```

## SKILL.md

```yaml
---
name: kebab-name
description: >-
  무엇을 하는지 + 언제 쓰는지(트리거 키워드 포함).
---
```

- `description` 이 자동 선택 기준이다. WHAT + WHEN.
- 본문: 체크리스트·명령·경로 위주.
- 상세는 `references/`.

## 원칙

1. 같은 스킬·룰이 있으면 새로 만들지 말고 보강 (`ponytail`).
2. 코드 워크플로면 `ponytail`·`clean-code-quality`·`exception-handling` 을 링크.
3. 화면이면 `design-reuse-first`, 스택이면 `use-stack-router` 를 링크.
4. 커밋·PR 이면 `commit-after-task-complete`·`github-pr-*` 재사용.
5. 대응 `.mdc` 가 있으면 상단에 "원본 규칙" 경로.
6. 명령·경로는 실제로 있는 것만 (`package.json` scripts 확인).

## 완료

- 폴더명 = frontmatter `name`
- 루트 `CLAUDE.md` 스킬 표에 한 줄
