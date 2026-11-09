# 출근콕 프로젝트 규칙

QR 기반 소규모 매장 근태관리 SaaS. 코드를 작성·수정·리뷰할 때 `.cursor/rules/` 규칙과 `.cursor/skills/` 스킬을 참조한다.

- 개요·실행: [README.md](README.md) · 스펙(정본): [docs/specs/README.md](docs/specs/README.md) · PRD: [docs/prd-v0.4.md](docs/prd-v0.4.md)
- 구조: pnpm 모노레포 — `apps/web`(Next.js 15 + Seed Design, 화면 + `/api/v1`), `apps/mobile`(Expo RN WebView 셸), `packages/db`(Prisma + PGlite), `packages/app-bridge`(웹 ↔ 앱 Zod 계약)

## 필수 참조 규칙 (작업 전 확인)

| 파일 | 내용 |
|------|------|
| `ponytail.mdc` | **모든 코드 작성 전 필수** — YAGNI·재사용·최소 diff. 스킬: `.cursor/skills/ponytail/SKILL.md` |
| `technical-stack.mdc` | 스택·버전·루트 명령 (`pnpm dev`/`build`/`typecheck`/`test`/`db:*`) |
| `project-architecture.mdc` | `app` → `features/<domain>/{ui,server,model,schema.ts}` → `shared`/`server` 계층 |
| `code-style.mdc` | 포맷(lint·prettier 없음, 기존 코드 기준), import 순서, React·TS 관례 |
| `naming-types.mdc` | 파일·식별자 네이밍, DTO·스키마 타입 위치 |
| `clean-code-quality.mdc` | 이름·매직 넘버·함수 크기/인자·조건 Depth≤2, 완료 전 `pnpm typecheck`/`pnpm test` |
| `exception-handling.mdc` | 서버 `ApiError` → `defineRoute` → `ApiRequestError` → 인라인 `role="alert"`. 빈 catch 금지 |
| `api-routes.mdc` | `/api/v1` Route Handler(`defineRoute`)·서비스(`(db, input)`, `requireMembership`)·`error-codes.ts` |
| `zod-validation-first.mdc` | body·query·외부 응답·앱 메시지는 Zod 통과 값만 |
| `state-data-management.mdc` | `apiFetch`·`useApiResource`·`usePolling`·도메인 훅 (TanStack Query 없음) |
| `error-loading.mdc` | 로딩·에러·빈 상태 인라인 패턴 (`error.tsx`·토스트·스켈레톤 없음) |
| `design-system.mdc` | Seed 컴포넌트·토큰 + `globals.css`, 임의 Hex 금지 (Tailwind 없음) |
| `design-reuse-components.mdc` | Seed → `shared/ui` → 도메인 `ui` 순으로 재사용 |
| `logic-ui-separation.mdc` | `*Screen.tsx` + `useXxx.ts` + `model/` 분리 |
| `component-max-lines.mdc` | TSX 300줄 이하 |
| `component-one-per-file.mdc` | export 컴포넌트 파일당 1개, 내부 조각은 허용 |
| `use-stack-router.mdc` | 매장 화면 webviewkit 2.3 스택 — `OwnerStackApp`, `AppLink`/`AppBackLink`/`useBackTo`, `keepAlive`+`useOnRevive`. 스킬: `use-stack-router` |
| `webview-shell.mdc` | RN WebView 셸 — app-bridge 메시지·handoff, safe-area 1회, in-flow 하단 CTA·키보드 |
| `animation-reuse-first.mdc` | 모션은 `apps/web/src/shared/motion/` 먼저, 없을 때만 신규 |
| `framer-motion-interaction.mdc` | framer-motion 타이밍·패턴·`useReducedMotion` |
| `testing.mdc` | vitest, 대상 옆 `*.test.ts(x)`, 서비스는 `createTestDb()`(PGlite), 렌더는 jsdom + RTL |
| `docs-spec-by-feature.mdc` | `docs/specs/<domain>/README.md` 정본, 동작 변경 시 같은 커밋에서 갱신 |
| `security-env.mdc` | 서버 전용 env·`.env.example`, `DEV_AUTH`·`CRON_SECRET`, 토큰 해시, WebView 신뢰 경계 |
| `a11y-seo.mdc` | 시맨틱 HTML, `aria-*`, `role="alert"`, alt, 줌 허용 |
| `performance.mdc` | `next/image`, 번들·폴링·쿼리 기본값 |
| `figma-mcp.mdc` | Figma URL 이 주어질 때만 — 로컬 Dev Mode MCP 우선, Seed 토큰 매핑, 스크린샷 대조 |
| `commit-convention.mdc` | `feat: 한글 설명`, **작성자 `안승찬 <94547692+Ahnseungc@users.noreply.github.com>` 고정, 회사 계정 금지** |
| `git-commit-after-task.mdc` | 작업 종료 시 검증 → 의도한 파일만 add(`-A` 금지) → 커밋. 푸시는 요청 시만 |
| `git-incremental-commits.mdc` | 큰 작업은 논리 단위로 커밋 분할 |
| `git-push-build-first.mdc` | 푸시 요청 시 `pnpm typecheck` → `pnpm test` → `pnpm build` 후 push |
| `github-pr-description.mdc` | PR 본문 섹션·`--body-file` |
| `github-pr-rebase-before-open.mdc` | PR 전 `origin/main` rebase + `--force-with-lease` |
| `communication-preferences.mdc` | 한국어 응답, 간결, 코드 중심 |
| `stop-slop.mdc` | 카피·스펙·PR 문체만 (전역 X). 스킬: `stop-slop` |

## 스킬 (`.cursor/skills/<name>/SKILL.md`)

| 스킬 | 용도 |
|------|------|
| `ponytail` | 코드 작성 전 사다리·체크리스트 |
| `clean-code-quality` / `exception-handling` / `zod-validation-first` | 품질·실패 경로·검증 체크리스트 |
| `design-reuse-first` | 화면 구현 시 재사용 탐색 순서 |
| `use-stack-router` | 새 매장 하위 화면 등록·이동 동작 고르기 |
| `animation-reuse-first` / `framer-motion-interaction` | 공용 모션 찾기·인터랙션 구현 |
| `spec-docs-by-feature` | 스펙 문서 작성·갱신 |
| `commit-after-task-complete` / `incremental-commit-workflow` | 작업 종료 커밋·커밋 분할 |
| `git-push-build-first` | 검증 후 푸시 |
| `github-pr-description` / `github-pr-rebase-before-open` | PR 본문·rebase |
| `review-bugbot` / `review-security` | 버그·보안 리뷰 서브에이전트 |
| `create-rule` / `create-skill` | `.cursor/rules`·`.cursor/skills` 작성 |
| `stop-slop` | UI 카피·문서 슬롭 제거 |

## 핵심 요약

### 명령 (루트)
- `pnpm dev` · `pnpm build` · `pnpm typecheck` · `pnpm test` · `pnpm db:dev` · `pnpm db:verify`
- 린트 스크립트 없음. 완료 전 `pnpm typecheck` + 관련 `pnpm test` 필수

### 아키텍처
- `page.tsx` 는 서버 컴포넌트, `features/<domain>/ui/*Screen` 하나를 그린다
- API: `app/api/v1/**/route.ts` = `defineRoute` + `features/<domain>/server/*-service.ts`
- 클라이언트 데이터: `apiFetch` / `useApiResource` → 도메인 훅 → 화면
- 매장 하위 화면은 `OwnerStackApp` 스택. 링크는 `AppLink`/`AppBackLink`
- 스펙(`docs/specs`)이 정본. 동작이 바뀌면 스펙도 같이

### 스타일
- Seed Design (`@seed-design/react` `Text`/`ActionButton`/`TextField`…, `--seed-color-*` 토큰) + `apps/web/src/app/globals.css`
- 임의 Hex 금지 (브랜드 레드만 `--color-brand-kok`)

### 코드
- 작은따옴표·세미콜론, import: 외부 → `@/` → 상대
- `any` 금지, `import type`, `console.log` 금지
- 의도적 단순화는 `ponytail:` 주석 (한계·전환 시점 명시)
- 실패: 서버 `ApiError` / 화면 인라인 `role="alert"`

### 커밋
- 형식: `feat: 한글 설명` (feat, fix, docs, style, refactor, test, chore)
- 작성자: `안승찬 <94547692+Ahnseungc@users.noreply.github.com>` — 회사 계정으로 커밋하지 않는다
- 스테이징은 경로 지정 (`git add -A` 금지). 푸시는 요청 시에만
