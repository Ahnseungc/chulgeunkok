# 출근콕 — QR 기반 소규모 매장 근태관리 SaaS

스티커 하나로 시작하는, 작은 가게를 위한 직원 관리 서비스.

- PRD: [docs/prd-v0.4.md](docs/prd-v0.4.md)
- 기능 스펙: [docs/specs/README.md](docs/specs/README.md)
- DB 스키마: [prisma/schema.prisma](prisma/schema.prisma)

## 마이그레이션

| 폴더 | 내용 |
|---|---|
| `prisma/migrations/0000_init` | `prisma migrate diff`로 생성한 테이블 |
| `prisma/migrations/0001_constraints` | Prisma 스키마로 표현할 수 없는 제약 (부분 유니크, CHECK, 근로조건 기간 겹침 금지). `btree_gist` 확장 필요 |
| `prisma/migrations/0002_spec_alignment` | 스펙 반영 (`OtpCode`, 정산 시작일 이력, 검토 키에 규칙 버전, `seenAt`) + 시스템 사용자·2026 규칙 시드 |

## 구조

```
src/
  app/                 화면(자리표시) + api/v1 Route Handler 껍데기 (스펙 API 표 1:1)
  features/<domain>/   도메인 Zod 스키마 (auth·store·staff·labor·attendance·payroll)
  server/http/         defineRoute(세션·Zod 검증·에러 포맷), 에러 코드 정본
  server/auth/         세션(개발용 임시), 매장 권한 규칙·가드
  shared/              공통 스키마, 화면 자리표시 컴포넌트
```

구현되지 않은 API는 `501 NOT_IMPLEMENTED`를 돌려준다.

## 실행

```bash
cp .env.example .env   # DATABASE_URL 수정
pnpm install
pnpm prisma:migrate
pnpm dev
```

Postgres 없이 돌려 보려면 PGlite 파일 DB를 쓴다 (데모 매장·직원·QR 포함):

```bash
pnpm dev:db            # .pglite/ 재생성, QR 랜딩 URL 출력
# .env: DATABASE_URL="pglite:./.pglite", DEV_AUTH="1"
pnpm dev
```

브라우저에서는 쿠키 `dev_user_id=staff` 로 직원을 고른다. 개발 중 API 로그인은 `.env`에 `DEV_AUTH=1`을 두고 요청 헤더 `x-dev-user-id: <User.id>`로 대신한다 (production에서는 무시).

## 검증

```bash
pnpm typecheck
pnpm test
DATABASE_URL=postgresql://x:x@localhost:5432/x pnpm prisma:validate
pnpm verify:constraints   # PGlite(인메모리 Postgres)에 마이그레이션 적용 후 제약 동작 확인
```

> 법령 해석은 설계용 가정이며, 출시 전 공인노무사 검토가 필요하다.

## 브랜드 에셋

`assets/brand/` — 앱 아이콘 시안 3종(A 글자콕 · B 점콕 · C QR콕, 1024/180), 스플래시, 워드마크(기본·단색·화이트), QR 스티커, 출근 완료 화면.
