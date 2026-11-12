# 출근콕 — 기능 스펙 인덱스

| 항목 | 값 |
| --- | --- |
| 상태 | **Draft** (2026-11-03) — PRD v0.4 기준 |
| PRD | [../prd-v0.4.md](../prd-v0.4.md) |
| 스키마 | [../../prisma/schema.prisma](../../prisma/schema.prisma) |
| 범위 | MVP P0. P1 항목은 각 문서 "비목표"에 표시 |

> **정본:** 시그니처·상태 전이·계산 규칙·에러 코드는 스펙이 정본이다. 배경·근거는 PRD. 둘이 다르면 스펙을 따르고 PRD를 고친다.

---

## 1. 문서 목록

| 문서 | PRD ID | 내용 |
| --- | --- | --- |
| [auth/README.md](./auth/README.md) | AUTH-01 | 기기 등록 세션, 사장님 휴대폰 인증, NFC |
| [store/README.md](./store/README.md) | STORE-01~03 | 매장, QR 토큰, 사업장 규모 신고 |
| [staff/README.md](./staff/README.md) | STAFF-01·02 | 초대(새 직원·기기 재등록), 직원 상태, 권한 |
| [labor/README.md](./labor/README.md) | LABOR-01·03·04·05 | 근로조건 버전, 검토 엔진, 바텀시트 |
| [attendance/README.md](./attendance/README.md) | TIME-01~04 | 출퇴근 punch, 퇴근 누락, 수정 요청 |
| [payroll/README.md](./payroll/README.md) | TIME-02, PAY-01, ADMIN-02 | 근무시간 계산, 예상 기본급, CSV |
| [dashboard/README.md](./dashboard/README.md) | ADMIN-01 | 관리자 대시보드 |
| [payslip/README.md](./payslip/README.md) | P1 임금명세서 | 명세서 초안·수정·보내기·정정, 직원별 공제, FCM 푸시 |
| [qr-card/README.md](./qr-card/README.md) | store §5 | QR 카드 셀프 제작(레이아웃·색·문구·로고, PDF·PNG), QR 원문 암호화 저장 |
| [notifications/README.md](./notifications/README.md) | P1 알림 | 출근·퇴근 10분 전·정시 푸시, 중복 방지, 건너뛰기 |

---

## 2. 공통 규칙

### 2.1 시간

- DB 저장은 UTC `timestamptz(3)`. 날짜만 있는 값(`@db.Date`)은 **매장 시간대 기준 날짜**.
- 계산·분할·요일 판정은 `Store.timezone`. MVP는 `Asia/Seoul` 고정(수정 UI 없음).
- 근무 시각은 **서버 수신 시각**만 쓴다. 클라이언트 시각은 받지 않는다.
- 주(week)는 **월요일 00:00 ~ 일요일 24:00** (매장 시간대).
- 시각·날짜 라이브러리는 `date-fns` + `@date-fns/tz`.

### 2.2 금액

- 원 단위 정수. 중간 계산은 초 단위 정수 × 시급으로 하고, **직원·정산기간 합계에서 1회** 원 미만 올림 (`payroll` §3).

### 2.3 API 공통

- 경로 `/api/v1`. Next.js Route Handler.
- 요청 body·query는 Zod로 검증. 실패 시 `400 VALIDATION_FAILED`.
- 응답 실패 포맷:

```ts
interface ApiError {
  error: {
    code: ErrorCode;     // 아래 표
    message: string;     // 사용자 노출 가능한 한국어 문장
    details?: unknown;   // 검증 실패 필드 등
  };
}
```

- 목록 응답은 `{ items: T[], nextCursor: string | null }`. 기본 `limit` 50, 최대 200.

### 2.4 공통 에러 코드

| code | HTTP | 의미 |
| --- | --- | --- |
| `UNAUTHENTICATED` | 401 | 세션 없음·만료 |
| `FORBIDDEN` | 403 | 역할·권한 부족 |
| `NOT_FOUND` | 404 | 리소스 없음 또는 **다른 매장 리소스** (존재 여부를 숨긴다) |
| `VALIDATION_FAILED` | 400 | 입력 검증 실패 |
| `CONFLICT` | 409 | 상태 충돌 (도메인별 세부 코드 우선) |
| `RATE_LIMITED` | 429 | 요청 제한 |
| `PHONE_VERIFICATION_REQUIRED` | 403 | 급여 권한 Manager가 휴대폰 인증 전 (auth §4.2) |
| `INTERNAL` | 500 | 서버 오류. 메시지는 일반 문구 |

도메인 에러 코드는 각 문서 "에러 코드" 절.

### 2.5 권한 매트릭스

| 동작 | Owner | Manager | Manager + `PAYROLL_READ` | Manager + `TERMS_EDIT` | Employee |
| --- | --- | --- | --- | --- | --- |
| 매장 수정·QR 재발급·규모 신고 | ✅ | ❌ | ❌ | ❌ | ❌ |
| QR 카드 디자인·로고 저장, QR 주소 조회 | ✅ | ❌ | ❌ | ❌ | ❌ |
| 직원 초대 | ✅ | ✅ (Employee만) | ✅ | ✅ | ❌ |
| 직원 비활성화·역할·권한 변경 | ✅ | ❌ | ❌ | ❌ | ❌ |
| 근로조건 조회(시급 포함) | ✅ | ❌ | ✅ | ✅ | 본인만 |
| 근로조건 등록 | ✅ | ❌ | ❌ | ✅ | ❌ |
| 근태 조회 | ✅ | ✅ | ✅ | ✅ | 본인만 |
| 근태 직접 수정·추가·수정 요청 승인 | ✅ | ✅ | ✅ | ✅ | ❌ |
| 수정 요청 생성 | ❌ | ❌ | ❌ | ❌ | 본인 근태만 |
| 검토 항목 조회·확인 | ✅ | ❌ | ✅ | ✅ | ❌ |
| 급여 미리보기·CSV | ✅ | ❌ | ✅ | ❌ | 본인 예상 급여만 |
| 임금명세서 수정·보내기 | ✅ | ❌ | ❌ | ❌ | ❌ |
| 임금명세서 조회 | ✅ | ❌ | ✅ | ❌ | 본인만 (보낸 것) |
| 구독 | ✅ | ❌ | ❌ | ❌ | ❌ |

- 권한 검사는 서버 공통 가드 `requireMembership(storeId, check)` 한 곳에서 한다. 비활성 Membership은 모든 매장 API에서 `FORBIDDEN`. 예외: 본인 임금명세서 조회·열람 기록(`/attendance/me/payslips`, 본인 `GET /payslips/:id`, `POST /payslips/:id/view`)은 퇴사 뒤에도 된다 (payslip §1-6).
- Manager에게 `PAYROLL_READ`가 없으면 근태 응답에서 **시급·금액 필드를 제거**한다 (응답 스키마 분리).
- "급여 미리보기·CSV", "임금명세서 조회", 대시보드 예상 인건비의 `PAYROLL_READ` Manager는 **휴대폰 인증(`User.phone`)까지** 해야 한다. 안 했으면 `403 PHONE_VERIFICATION_REQUIRED` (대시보드는 금액만 숨김).
- 시급이 보이는 "근로조건 조회"·"검토 항목 조회·확인"도 Manager는 `TERMS_EDIT`이 있거나, `PAYROLL_READ` + 휴대폰 인증이어야 한다 (직원 상세는 근로조건 구역을 숨기고, 대시보드는 검토 수를 숨김). 판정은 `access.needsVerifiedPhone` → `requireMembership` 한 곳 (auth §4.2, Q8).

### 2.6 감사

| 변경 | 기록 위치 |
| --- | --- |
| 근로조건 | `EmploymentTerms` 새 버전 (불변) |
| 근태 | `AttendanceRevision` |
| 사업장 규모 | `StoreHeadcountDeclaration` 이력 |
| 검토 확인 | `LaborReview.acknowledgedBy/At` |
| 역할·권한·직원 상태 | `MembershipEvent` (`ROLE_CHANGED`·`PERMISSIONS_CHANGED`·`DEACTIVATED`·`REACTIVATED`, before·after, actor). 변경과 같은 트랜잭션 — staff §4.3 |

---

## 3. 라우트 맵 (Web)

| URL | 사용자 | 문서 |
| --- | --- | --- |
| `/owner/login` | Owner | auth §4 (다음 작업) |
| `/p/[qrToken]` | Employee | attendance (QR 랜딩) |
| `/invite/[token]` | Employee | staff |
| `/me` | Employee | attendance · payroll (본인 기록·예상 급여) |
| `/me/payslips` | Employee | payslip §5.3 (본인 명세서 목록) |
| `/me/payslips/[payslipId]` | Employee | payslip §5.3 (명세서 상세·열람 기록) |
| `/owner/stores/new` | Owner | store |
| `/owner/[storeId]` | Owner·Manager | dashboard |
| `/owner/[storeId]/members` | Owner·Manager | staff |
| `/owner/[storeId]/members/[memberId]` | Owner·Manager | staff · labor |
| `/owner/[storeId]/attendances` | Owner·Manager | attendance |
| `/owner/[storeId]/payroll` | Owner·`PAYROLL_READ` | payroll |
| `/owner/[storeId]/settings` | Owner | store |
| `/owner/[storeId]/qr-card` | Owner | qr-card §5 (QR 카드 꾸미기·PDF·PNG 받기) |

---

## 4. 미결정

| # | 질문 | 영향 |
| --- | --- | --- |
| Q1 | 역할·권한·직원 상태 변경 감사 로그를 MVP에 넣을지 — **결정됨 (2026-11-12): 넣는다.** `MembershipEvent`, 직원 상세(사장님)에 "변경 이력" | staff §4.3 (`0010_membership_event`) |
| Q2 | SMS 공급자 계약 (어댑터는 구현됨, 지금은 `dev`) — **MVP 제외.** 공급자는 출시 때 정한다 | auth §4.1 |
| Q3 | 퇴근 누락 자동 전환 기준 — **결정됨 (2026-11-12): 소정 종료 + 4시간.** 소정 없음·추가 근무·주마다 다른 근로조건은 출근 + 16시간 (`MISSING_AFTER_*_MS`) | attendance §5 |
| Q4 | "매장 밖" 판정 반경 — **결정됨 (2026-11-12): 200m.** 위치 정확도가 100m를 넘으면 판정하지 않는다 (`OUTSIDE_AREA_RADIUS_M`) | attendance §4 |
| Q5 | 원 미만 올림 정책 — **결정됨 (2026-11-12): 직원·기간 합계에서 1회 올림.** | payroll §3 |
| Q6 | 법정수당 세부 규칙 (노무사 검증) — **MVP 제외.** 기준값은 설계 가정이고 화면은 모두 "예상" | labor §4 |
| Q7 | 관리자 근태 직접 추가를 P0에 넣을지 — **결정됨 (2026-11-12): 넣는다.** Owner·Manager가 빠진 근무를 만들고 `AttendanceRevision.before = null` | attendance §7.5 |
| Q8 | 급여 권한 받은 Manager에게 휴대폰 인증을 추가로 요구할지 — **결정됨 (2026-11-12): 요구한다.** `PAYROLL_READ` Manager는 `User.phone`이 있어야 급여를 본다. 없으면 `403 PHONE_VERIFICATION_REQUIRED`, 대시보드는 금액만 숨김 | auth §4.2 |

---

## 5. 스키마 반영 내역

스펙 작성 중 나온 변경. `prisma/migrations/0002_spec_alignment` 에 반영됨 (2026-11-03).

| 모델 | 변경 | 근거 |
| --- | --- | --- |
| `OtpCode` (신규) | `phone`, `codeHash`, `attempts`(CHECK 0~5), `expiresAt`, `consumedAt` | auth §5 |
| `Store` | `previousPayPeriodStartDay Int?`, `payPeriodStartDayEffectiveFrom DateTime? @db.Date` | store §4 |
| `LaborReview` | 유니크 키에 `ruleVersion` 추가 | labor §4.1 |
| `LaborReview` | `seenAt DateTime?` | labor §6.2 |
| `User` | 시스템 사용자 시드 `id = 'system'` (자동 전환 actor) | attendance §5.1 |
| `DeviceCredential` (신규) | `userId`, `tokenHash`, `revokedAt` — 기기 쿠키 세션 | auth §3 (`0003_device_auth`) |
| `StoreInvitation` | `memberId`(기기 재등록 대상), `phone` 제거 | staff §3 (`0003_device_auth`) |
| `Store` | `businessNumber`, `businessVerifiedAt`, `placeProvider`, `placeId` + 운영 중 매장 장소 부분 유니크 | store §3 (`0004_store_onboarding`) |
| `DeviceHandoffCode` (신규) | `userId`, `codeHash`, `expiresAt`, `usedAt` — 앱 ↔ WebView 세션 연결 60초 코드 | auth §6.2 (`0005_device_handoff`) |
| `Payslip`·`PayslipLine`·`PushToken` (신규), `Store.payDay`, `EmploymentTerms.deductionType` | 임금명세서와 FCM 토큰. DRAFT 부분 유니크·`payDay` 1~31 CHECK. 사원번호 컬럼 없음(순번 계산 후 스냅숏) | payslip §4.1 (`0006_payslip`) |
| `LaborRuleSet` | 2026 시드 `version = '2026.1'`, `minimumHourlyWage = 10320`, 시간 기준값은 `rules` JSON | labor §4.1 |
| `MembershipEvent` (신규) | `membershipId`, `actorId`, `type`(enum), `before`·`after` Json, 인덱스 `(membershipId, createdAt)` | staff §4.3 (`0010_membership_event`) |
