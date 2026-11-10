<div align="center">

<img src="apps/mobile/assets/icon.png" width="96" alt="출근콕 앱 아이콘" />

<br /><br />

<img src="apps/web/public/brand/wordmark.png" width="220" alt="출근콕" />

### 매장에 QR 스티커 하나 붙이면, 출퇴근부터 월말 정산까지

작은 음식점·카페·주점 사장님을 위한 근태관리 서비스입니다.<br />
직원은 휴대폰으로 매장 QR을 **콕** 찍어 출퇴근하고, 사장님은 근무시간과 예상 급여를 한 화면에서 확인합니다.

![Next.js](https://img.shields.io/badge/Next.js_15-000000?style=flat-square&logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React_19-61DAFB?style=flat-square&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Expo](https://img.shields.io/badge/Expo-000020?style=flat-square&logo=expo&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-2D3748?style=flat-square&logo=prisma&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white)

</div>

---

## 이렇게 씁니다

<table>
<tr>
<td width="34%" align="center"><img src="assets/brand/%EC%B6%9C%EA%B7%BC%EC%BD%95-QR%EC%8A%A4%ED%8B%B0%EC%BB%A4.png" width="200" alt="매장 QR 스티커" /></td>
<td>

**1. 사장님이 매장에 QR 스티커를 붙입니다**<br />
휴대폰 인증 후 가게를 검색해 매장을 만들면 매장 전용 QR이 나옵니다. 별도 단말기는 필요 없습니다.

**2. 직원은 초대 링크로 한 번만 기기를 등록합니다**<br />
그다음부터는 QR을 찍고 버튼 하나로 출근·퇴근. 지금 상태를 서버가 판단해 출근/퇴근이 자동으로 바뀌어 잘못 누를 일이 없습니다.

**3. 근무시간과 예상 급여가 자동으로 정리됩니다**<br />
정산 기간별 근무시간·예상 기본급을 계산하고, 퇴근 누락·휴게 미설정·근로조건 누락처럼 사장님이 챙겨야 할 일을 먼저 알려 줍니다.

</td>
</tr>
</table>

## 직원 화면

<table>
<tr>
<td align="center"><img src="docs/screenshots/employee-qr.png" width="220" alt="QR 찍고 출근하기" /></td>
<td align="center"><img src="docs/screenshots/employee-clock-in.png" width="220" alt="콕! 출근 완료" /></td>
<td align="center"><img src="docs/screenshots/employee-my-work.png" width="220" alt="내 근무 기록과 예상 급여" /></td>
</tr>
<tr>
<td align="center">QR 찍고 출근하기</td>
<td align="center">콕! 출근 완료</td>
<td align="center">내 근무 · 예상 급여</td>
</tr>
</table>

## 사장님 화면

<table>
<tr>
<td align="center"><img src="docs/screenshots/owner-home.png" width="220" alt="매장 대시보드" /></td>
<td align="center"><img src="docs/screenshots/owner-attendances.png" width="220" alt="근태 기록" /></td>
<td align="center"><img src="docs/screenshots/owner-payroll.png" width="220" alt="정산과 CSV 내보내기" /></td>
</tr>
<tr>
<td align="center">지금 근무 중 · 처리할 일</td>
<td align="center">직원별 근태 기록</td>
<td align="center">정산 · CSV 내보내기</td>
</tr>
</table>

## 주요 기능

| | 기능 |
|---|---|
| ⏱️ | **QR 출퇴근** — 매장 QR + 등록된 기기로만 기록, 재시도해도 중복 없음(Idempotency-Key) |
| 📋 | **근태 관리** — 퇴근 누락 자동 전환, 근무 수정 요청·승인 |
| 💰 | **정산** — 요일별 근로조건·시급 이력 기준 예상 기본급, 근무별·직원별 CSV |
| ⚖️ | **노무 검토 안내** — 최저임금·법정 휴게·야간·연장·결근 의심을 검토 시점에 알림 (사업장 규모에 따라 문구 분기) |
| 📱 | **앱 셸** — Expo 앱이 WebView로 웹 화면을 띄우고 QR 스캔·기기 토큰 보관을 맡음 |

> 법령 해석은 설계용 가정이며, 출시 전 공인노무사 검토가 필요합니다. 서비스는 노무 판단을 대신하지 않고 "검토가 필요한 시점"을 안내합니다.

---

## 개발

### 모노레포 구조

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

### 실행

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

### 배치

외부 스케줄러가 `Authorization: Bearer <CRON_SECRET>`로 부른다 (`CRON_SECRET`이 비어 있으면 항상 401).

| 작업 | 주기 | 내용 |
|---|---|---|
| `/api/internal/jobs/missing-clock-out` | 10분 | 퇴근 누락 자동 전환 |
| `/api/internal/jobs/daily-reviews` | 매일 06:00 KST (21:00 UTC) | 결근 의심 + 최근 근무 야간·연장 재평가 |

```bash
curl -H "authorization: Bearer $CRON_SECRET" http://localhost:3000/api/internal/jobs/daily-reviews
```

#### 앱 (Expo)

웹 dev 서버를 띄운 뒤 iOS 시뮬레이터에서 Expo Go로 연다. WebView 주소는 `apps/mobile/app.json`의 `extra.webOrigin` (기본 `http://localhost:3020`, 실기기는 PC의 LAN IP로 바꾼다).

```bash
pnpm --filter @chulgeunkok/mobile ios
```

> PGlite 개발 DB는 dev 서버가 강제 종료되면 파일이 깨질 수 있다. "Aborted()" 오류가 나면 `pnpm db:dev`로 다시 만든다.

### 마이그레이션

| 폴더 (`packages/db/prisma/migrations/`) | 내용 |
|---|---|
| `0000_init` | `prisma migrate diff`로 생성한 테이블 |
| `0001_constraints` | Prisma 스키마로 표현할 수 없는 제약 (부분 유니크, CHECK, 근로조건 기간 겹침 금지) |
| `0002_spec_alignment` | `OtpCode`, 정산 시작일 이력, 검토 키에 규칙 버전, `seenAt` + 시스템 사용자·2026 규칙 시드 |
| `0003_device_auth` | 기기 세션 `DeviceCredential`, 초대 종류(새 직원·기기 재등록) |
| `0004_store_onboarding` | 매장 사업자번호·확인 시각, 카카오 장소 ID(운영 중 매장 중복 등록 금지) |
| `0005_device_handoff` | 앱 ↔ WebView 세션 연결용 60초 일회용 코드 `DeviceHandoffCode` |

### 검증

```bash
pnpm typecheck
pnpm test
pnpm db:verify   # PGlite에 마이그레이션 적용 후 제약 동작 확인
```
