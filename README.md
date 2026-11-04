# 출근콕 — QR 기반 소규모 매장 근태관리 SaaS

스티커 하나로 시작하는, 작은 가게를 위한 직원 관리 서비스.

- PRD: [docs/prd-v0.4.md](docs/prd-v0.4.md)
- 기능 스펙: [docs/specs/README.md](docs/specs/README.md)
- DB 스키마: [packages/db/prisma/schema.prisma](packages/db/prisma/schema.prisma)

## 모노레포 구조

pnpm 워크스페이스.

```
apps/
  web/                  Next.js 15 — 화면 + /api/v1 (RN 앱 WebView가 이 화면을 띄운다)
    src/app/            라우트. 미구현 API는 501 NOT_IMPLEMENTED
    src/features/<도메인>/  schema(Zod) · model(공용 타입·순수 규칙) · server(서비스) · ui
    src/server/         defineRoute(세션·검증·에러 포맷), 에러 코드, 권한 가드, 기기 세션
  mobile/               Expo 셸 — WebView·QR 스캐너·기기 토큰 보관 (docs/specs/auth §6)
packages/
  db/                   Prisma 스키마·마이그레이션, createDbClient, 테스트용 PGlite DB
  app-bridge/           웹 ↔ 앱 메시지 스키마(Zod)·딥링크 경로 검증
```

## 실행

로컬 Postgres 없이 PGlite 파일 DB로 돌린다 (데모 매장·직원·QR·초대 포함).

```bash
pnpm install
pnpm db:dev
```

`apps/web/.env`:

```
DATABASE_URL="pglite:../../packages/db/.pglite"
DEV_AUTH="0"
APP_ORIGIN="http://localhost:3000"
```

```bash
pnpm dev
```

`pnpm db:dev`가 출력한 초대 경로(`/invite/...`)를 열어 기기를 등록한 뒤 QR 경로(`/p/...`)로 출퇴근한다. PGlite는 한 프로세스만 열 수 있으니 `db:dev`는 dev 서버를 끈 상태에서 돌린다.

실제 Postgres: `DATABASE_URL`을 바꾸고 `pnpm db:migrate`. 확장 `btree_gist`가 필요하다.

사장님 화면은 `/owner` → 휴대폰 인증(개발 중에는 화면에 인증번호가 보인다) → 매장 만들기(가게 검색·사업자 확인) → 매장 QR.

외부 연동 키(`KAKAO_REST_API_KEY`, `NTS_SERVICE_KEY`)가 비어 있으면 개발용 응답을 쓴다. 키 발급처는 `apps/web/.env.example` 참고.

개발 중 사장님 화면 등은 `DEV_AUTH="1"`로 두고 `x-dev-user-id` 헤더나 `dev_user_id` 쿠키로 사용자를 고른다 (production에서는 무시).

## 배치

외부 스케줄러가 `Authorization: Bearer <CRON_SECRET>`로 부른다 (`CRON_SECRET`이 비어 있으면 항상 401).

| 작업 | 주기 | 내용 |
|---|---|---|
| `/api/internal/jobs/missing-clock-out` | 10분 | 퇴근 누락 자동 전환 |
| `/api/internal/jobs/daily-reviews` | 매일 06:00 KST (21:00 UTC) | 결근 의심 + 최근 근무 야간·연장 재평가 |

```bash
curl -H "authorization: Bearer $CRON_SECRET" http://localhost:3000/api/internal/jobs/daily-reviews
```

### 앱 (Expo)

웹 dev 서버를 띄운 뒤 iOS 시뮬레이터에서 Expo Go로 연다. WebView 주소는 `apps/mobile/app.json`의 `extra.webOrigin` (기본 `http://localhost:3020`, 실기기는 PC의 LAN IP로 바꾼다).

```bash
pnpm --filter @chulgeunkok/mobile ios
```

> PGlite 개발 DB는 dev 서버가 강제 종료되면 파일이 깨질 수 있다. "Aborted()" 오류가 나면 `pnpm db:dev`로 다시 만든다.

## 마이그레이션

| 폴더 (`packages/db/prisma/migrations/`) | 내용 |
|---|---|
| `0000_init` | `prisma migrate diff`로 생성한 테이블 |
| `0001_constraints` | Prisma 스키마로 표현할 수 없는 제약 (부분 유니크, CHECK, 근로조건 기간 겹침 금지) |
| `0002_spec_alignment` | `OtpCode`, 정산 시작일 이력, 검토 키에 규칙 버전, `seenAt` + 시스템 사용자·2026 규칙 시드 |
| `0003_device_auth` | 기기 세션 `DeviceCredential`, 초대 종류(새 직원·기기 재등록) |
| `0004_store_onboarding` | 매장 사업자번호·확인 시각, 카카오 장소 ID(운영 중 매장 중복 등록 금지) |
| `0005_device_handoff` | 앱 ↔ WebView 세션 연결용 60초 일회용 코드 `DeviceHandoffCode` |

## 검증

```bash
pnpm typecheck
pnpm test
pnpm db:verify   # PGlite에 마이그레이션 적용 후 제약 동작 확인
```

> 법령 해석은 설계용 가정이며, 출시 전 공인노무사 검토가 필요하다.

## 브랜드 에셋

`assets/brand/` — 앱 아이콘 시안 3종(A 글자콕 · B 점콕 · C QR콕, 1024/180), 스플래시, 워드마크(기본·단색·화이트), QR 스티커, 출근 완료 화면.
