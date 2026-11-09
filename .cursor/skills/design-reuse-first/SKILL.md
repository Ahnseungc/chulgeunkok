---
name: design-reuse-first
description: >-
  화면을 구현할 때 Seed 컴포넌트·apps/web/src/shared/ui·같은 도메인 ui·globals.css 블록을 먼저 찾아
  조합하고, 없을 때만 새 컴포넌트를 만든다. Triggers: 디자인 구현, 화면 구현, 공통 컴포넌트, Seed, 피그마.
---

# 화면 구현 — 재사용 우선

규칙 원본: `.cursor/rules/design-reuse-components.mdc` · 토큰: `.cursor/rules/design-system.mdc`

## 순서

1. 화면이 무엇을 보여 주는지 스펙에서 확인 (`docs/specs/<domain>` 화면 절).
2. 찾기:

```bash
ls apps/web/node_modules/@seed-design/react/lib/components
ls apps/web/src/shared/ui apps/web/src/features/<domain>/ui
grep -n "^\.[a-z]" apps/web/src/app/globals.css
```

3. 조합: `<main className="screen">` → `AppBackLink` → `Text as="h1"` → 본문 → `.punch-bottom` 안 `ActionButton size="large" flexGrow`.
4. 없을 때만 새 조각 — `features/<domain>/ui/`. 두 번째 도메인에서 쓰면 `shared/ui/` 로.
5. 새 CSS 는 `globals.css` 관련 블록 근처, Seed 색 토큰만.

## 체크

```
- [ ] Seed 에 있는 컴포넌트를 다시 만들지 않았다
- [ ] 링크는 AppLink/AppBackLink
- [ ] 시트는 shared/ui/Sheet
- [ ] 임의 Hex 없음
- [ ] TSX 300줄 이하
```
