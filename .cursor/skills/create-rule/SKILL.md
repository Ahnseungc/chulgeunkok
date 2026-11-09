---
name: create-rule
description: >-
  출근콕 `.cursor/rules/*.mdc` 규칙을 작성·추가한다. 새 룰, alwaysApply, globs, CLAUDE.md 연동, create rule 요청 시 사용.
---

# Create Rule (출근콕)

## 위치·형식

- 경로: `.cursor/rules/<kebab-name>.mdc`
- frontmatter:

```yaml
---
description: 룰 피커에 보일 한 줄
globs: "apps/web/src/**/*.tsx"   # 파일 한정 시. 전역이면 생략
alwaysApply: false               # 전역이면 true
---
```

## 절차

1. 목적·범위 확인. 범위가 불명확하면 "항상 vs 특정 파일"을 묻는다.
2. 파일 한정이면 glob 을 모노레포 경로로 구체화 (`apps/web/src/features/**`, `apps/mobile/**`, `packages/app-bridge/**`).
3. 같은 주제 룰이 있으면 **보강**한다. 복제 금지.
4. 본문은 짧게. 일반론 대신 이 저장소 고유 규칙만. **참조하는 파일·명령은 실제로 있는지 확인**한다 (`ls`, `grep`, `package.json` scripts).
5. 전역·자주 쓰는 룰이면 루트 `CLAUDE.md` 표에 한 줄 추가.

## 관례

- 한국어. 커밋은 `commit-convention` (`docs: ...`).
- `ponytail`, `design-system`(Seed), `code-style` 과 충돌하지 않게.
- 스킬과 쌍이면 `.cursor/skills/<name>/SKILL.md` 도 만들고 서로 링크.
