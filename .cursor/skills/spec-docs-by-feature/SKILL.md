---
name: spec-docs-by-feature
description: >-
  출근콕 기능 스펙(docs/specs/<domain>/README.md)을 만들거나 고친다. 스펙이 정본 — 동작·API·에러 코드·계산 규칙
  변경 시 같은 커밋에서 갱신. Triggers: 스펙, 기능 문서, docs/specs, PRD, 스펙 갱신, 에러 코드 추가.
---

# 기능 스펙 문서 — 스킬

규칙 원본: `.cursor/rules/docs-spec-by-feature.mdc`

## 기존 스펙 고치기

1. `docs/specs/README.md` §1 에서 도메인 문서 찾기.
2. 바꾸는 절(API·상태 전이·에러 코드·수용 기준)만 수정. 공통 규칙(§2 시간·금액·API·권한)과 어긋나지 않는지 확인.
3. 코드 docblock 의 스펙 절 번호가 바뀌면 grep 으로 같이 고친다:

```bash
grep -rn "docs/specs/<domain>" apps/web/src
```

4. PRD(`docs/prd-v0.4.md`)와 달라지면 PRD 쪽을 고치거나 사용자에게 알린다.

## 새 도메인

1. `docs/specs/<domain>/README.md` — `docs/specs/staff/README.md` 의 머리 표(상태·PRD ID)와 절 순서를 따른다.
2. `docs/specs/README.md` §1 표에 한 줄.
3. 코드 폴더 `apps/web/src/features/<domain>/` 이름을 맞춘다.

## 문체

짧은 문장, 표 위주, 결정과 근거. 카피 교정은 `.cursor/skills/stop-slop/SKILL.md`.
