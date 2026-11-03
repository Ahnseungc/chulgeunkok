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

## 검증

```bash
pnpm install
DATABASE_URL=postgresql://x:x@localhost:5432/x pnpm prisma:validate
pnpm verify:constraints   # PGlite(인메모리 Postgres)에 마이그레이션 적용 후 제약 동작 확인
```

> 법령 해석은 설계용 가정이며, 출시 전 공인노무사 검토가 필요하다.

## 브랜드 에셋

`assets/brand/` — 앱 아이콘 시안 3종(A 글자콕 · B 점콕 · C QR콕, 1024/180), 스플래시, 워드마크(기본·단색·화이트), QR 스티커, 출근 완료 화면.
