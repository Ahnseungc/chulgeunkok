# 임금명세서 — 기능 스펙

| 항목 | 값 |
| --- | --- |
| 상태 | **Draft** (2026-11-11) |
| PRD | [§3, P1 "임금명세서 생성·교부"](../../prd-v0.4.md) |
| 인덱스 | [../README.md](../README.md) |

> 근로기준법 §48②: 사용자는 임금을 지급할 때 임금명세서를 서면(전자문서 포함)으로 교부해야 한다. 상시근로자 수와 상관없이 전 사업장 의무다. 법정 기재사항과 공제 계산은 설계용 가정이며 출시 전 노무사·세무 검토를 받는다 (인덱스 Q6).

---

## 1. 개요

1. 정산 기간이 끝나면 직원별 **명세서 초안**이 자동으로 생긴다. 지급 항목은 `payroll` §3의 예상 기본급·주휴·가산·유급휴일수당을 그대로 쓴다.
2. 공제는 **직원별 선택**이다. 근로조건에 `없음 / 3.3% / 4대보험` 중 하나를 둔다. 3.3%는 자동 계산, 4대보험은 사장님이 금액을 넣는다.
3. 사장님이 금액을 확인·수정하고 **"보내기"** 를 누른다. 확인 없이 직원에게 나가는 일은 없다.
4. 보내면 직원 앱에 **푸시 알림**(Firebase Cloud Messaging)이 가고, 직원은 앱 안 `/me/payslips/[id]` 에서 본다.
5. 보낸 뒤 그 기간 근태·근로조건이 바뀌면 **정정본 초안**이 생긴다. 사장님이 확인하고 다시 보내면 직원에게 "정정된 명세서" 알림이 간다. 근태 정정은 근무일로부터 35일로 막혀 있으므로(`attendance` §7) 정정본도 그 안에서만 생긴다.

> 직원은 앱(WebView)으로만 쓴다. 웹 브라우저만 쓰는 직원에게 따로 알리는 경로는 만들지 않는다.

6. **퇴사자(INACTIVE)도 본인 명세서 조회는 된다.** 인덱스 §2.5의 "비활성 Membership은 FORBIDDEN"에서 `/me/payslips`·`GET /payslips/:id`(본인)·`POST /payslips/:id/view` 만 예외로 둔다. 마지막 달 명세서 교부 때문이다.

## 2. 범위 / 비목표

| 포함 | 제외 |
| --- | --- |
| 초안 자동 생성, 금액 수정·항목 추가, 보내기 | PDF 다운로드·인쇄 |
| 직원별 공제 방식 (없음·3.3%·4대보험 수기) | 4대보험·간이세액표 자동 계산 |
| 정정본 재교부, 이전 버전 열람 | 급여 이체·지급 확인 |
| FCM 푸시 (명세서 도착·정정) | 그 밖의 푸시 (퇴근 누락 알림 등은 이 기반 위에 따로) |
| 직원 열람 기록 (`viewedAt`) | 연말정산, 퇴직금·연차수당 정산 |
| 매장 급여 지급일 설정 | 생년월일 수집 |

## 3. 명세서 항목

### 3.1 법정 기재사항 (근기법 시행령 §27의2) → 출처

| 기재사항 | 출처 |
| --- | --- |
| 성명 | `User.name` (보낸 시점 스냅숏) |
| 생년월일 **또는 사원번호** | `Membership.employeeNumber` — 매장 안 1부터 순번. 생년월일은 받지 않는다 |
| 임금 지급일 | `Payslip.payDate` (매장 지급일로 기본값, 초안에서 수정 가능, §3.4) |
| 임금 총액 | 지급 항목 합계 |
| 항목별 금액 | `PayslipLine` (EARNING) |
| 항목별 계산방법 | `PayslipLine.basis` 문구 (예: `45시간 30분 × 10,320원`) |
| 근로일수 | 기간 안 인정 근무가 있는 날짜 수 |
| 총 근로시간 | `recognizedSeconds` |
| 연장·야간·휴일 근로시간 | `allowances.overtimeSeconds·nightSeconds·holidaySeconds` |
| 공제 항목별 금액·계산방법 | `PayslipLine` (DEDUCTION) |

### 3.2 지급 항목 (EARNING)

`payroll` 미리보기의 직원 1명 결과를 그대로 옮긴다. 0원 항목은 만들지 않는다.

| code | 이름 | basis 예 |
| --- | --- | --- |
| `BASE_PAY` | 기본급 | `45시간 30분 × 10,320원` (시급이 여러 개면 줄 바꿔 각각) |
| `WEEKLY_HOLIDAY_PAY` | 주휴수당 | `4주 × 1일 소정 5시간 × 10,320원` |
| `OVERTIME_PREMIUM` | 연장근로 가산 | `3시간 × 10,320원 × 0.5` |
| `NIGHT_PREMIUM` | 야간근로 가산 | 같은 꼴 |
| `HOLIDAY_PREMIUM` | 휴일근로 가산 | 8시간까지·넘는 분 따로 |
| `PAID_HOLIDAY_PAY` | 유급휴일수당 | `2일 × 8시간 × 10,320원` |
| `CUSTOM` | 사장님이 추가 (식대·상여 등) | 사장님 입력 |

### 3.3 공제 항목 (DEDUCTION)

초안의 `Payslip.deductionType` 기본값은 근로조건 `deductionType` (기간 마지막 날 유효한 버전). **DRAFT에서 명세서마다 바꿀 수 있다** — 근로조건은 지난 기간으로 소급해 고칠 수 없고(`labor` §3 `TERMS_HAS_LATER_ATTENDANCE`), 출시 직후 기존 직원은 모두 `NONE`이기 때문이다. 바꾸면 공제 줄 묶음을 지우고 새 방식으로 다시 만든다 (수기 공제 기본값 규칙은 아래와 같음).

| 값 | 생기는 줄 | 계산 |
| --- | --- | --- |
| `NONE` | 없음 | — |
| `WITHHOLDING_3_3` | `INCOME_TAX` 소득세 3%, `LOCAL_INCOME_TAX` 지방소득세 0.3% | 지급 총액 × 3% → **10원 미만 절사**, 지방소득세 = 소득세 × 10% → 10원 미만 절사 |
| `SOCIAL_INSURANCE` | `NATIONAL_PENSION`, `HEALTH_INSURANCE`, `LONG_TERM_CARE`, `EMPLOYMENT_INSURANCE`, `INCOME_TAX`, `LOCAL_INCOME_TAX` | 자동 계산 없음. 같은 직원의 **직전 보낸 명세서 금액**을 기본값으로 채우고, 없으면 0원. 사장님이 고친다 |

- 3.3% 계산식과 절사 단위는 가정이다 (세무 검토 필요). 순수 함수 `calculateWithholding33(grossPay)` 로 두고 테스트로 고정한다.
- 지급 총액이 바뀌면(사장님 수정·정정) 3.3% 줄은 **다시 계산**한다. 사장님이 3.3% 줄 금액을 직접 고쳤다면 그 값을 유지한다 (§4.2).
- 실지급액 = 지급 총액 − 공제 총액. 음수면 보내기를 막는다 (`PAYSLIP_NET_NEGATIVE`).

### 3.4 지급일

- `Store.payDay` (1~31, 기본 없음). 기간 끝 다음 달 그 날짜, 그 달에 없는 날이면 말일.
  - 예: 기간 10/1~11/1, `payDay = 10` → 11/10. 기간 10/21~11/21, `payDay = 10` → 12/10.
  - 규칙: 기간 `end` 이후 처음 오는 `payDay`.
- `payDay` 미설정이면 초안의 `payDate`는 비어 있고, 보내기 전에 입력해야 한다 (`PAYSLIP_PAY_DATE_REQUIRED`). 매장 설정에 "급여 지급일" 항목을 추가한다.

## 4. 모델·상태

### 4.1 스키마

```prisma
enum PayslipStatus {
  DRAFT       // 사장님 확인 전
  SENT        // 교부됨 (현재 유효본)
  SUPERSEDED  // 정정본이 보내져 대체됨
}

enum DeductionType {
  NONE
  WITHHOLDING_3_3
  SOCIAL_INSURANCE
}

enum PayslipLineKind {
  EARNING
  DEDUCTION
}

model Payslip {
  id                 String        @id @default(cuid())
  storeId            String
  membershipId       String
  periodStart        DateTime      @db.Date
  periodEnd          DateTime      @db.Date // 미포함
  version            Int           // 1 = 최초, 2부터 정정본
  status             PayslipStatus @default(DRAFT)
  needsRecalculation Boolean       @default(false) // §4.3
  payDate            DateTime?     @db.Date
  // 보낼 때 고정되는 스냅숏
  employeeName       String
  employeeNumber     Int
  workDays           Int
  recognizedSeconds  Int
  overtimeSeconds    Int
  nightSeconds       Int
  holidaySeconds     Int
  deductionType      DeductionType
  grossPay           Int
  totalDeduction     Int
  netPay             Int
  correctionNote     String?       // 정정본일 때 직원에게 보이는 사유
  sentAt             DateTime?     @db.Timestamptz(3)
  sentById           String?
  viewedAt           DateTime?     @db.Timestamptz(3) // 직원이 처음 연 시각
  createdAt          DateTime      @default(now()) @db.Timestamptz(3)
  updatedAt          DateTime      @updatedAt @db.Timestamptz(3)

  lines PayslipLine[]

  @@unique([membershipId, periodStart, version])
  @@index([storeId, periodStart])
}

model PayslipLine {
  id               String          @id @default(cuid())
  payslipId        String
  kind             PayslipLineKind
  code             String          // §3.2·§3.3 code
  label            String
  basis            String          // 계산방법 문구
  calculatedAmount Int?            // 시스템 계산값. CUSTOM·수기 공제는 null
  amount           Int             // 최종 금액
  adjustReason     String?         // amount ≠ calculatedAmount 이면 필수
  sortOrder        Int

  payslip Payslip @relation(fields: [payslipId], references: [id], onDelete: Cascade)
}

model PushToken {
  id                 String   @id @default(cuid())
  deviceCredentialId String   @unique // 기기 1대 = 토큰 1개
  userId             String
  token              String   @unique // FCM registration token
  platform           String   // 'ios' | 'android'
  updatedAt          DateTime @updatedAt @db.Timestamptz(3)

  @@index([userId])
}
```

추가 필드:
- `EmploymentTerms.deductionType DeductionType @default(NONE)` — 근로조건 새 버전으로 바꾼다 (`labor` §3, 불변 버전).
- `Store.payDay Int?`
- `Membership.employeeNumber Int` — 매장 안 순번, `@@unique([storeId, employeeNumber])`. 기존 데이터는 `joinedAt` 순으로 채우는 마이그레이션.

같은 `(membershipId, periodStart)` 에 `DRAFT`는 최대 1개 (raw SQL 부분 유니크).

### 4.2 상태 전이

```
(초안 생성) → DRAFT ──보내기──▶ SENT ──(정정본 SENT)──▶ SUPERSEDED
                 ▲                │
                 └── 근태 변경 ───┘  version+1 DRAFT 생성 (SENT는 그대로 유효)
```

- **DRAFT 수정**: 줄 금액 변경(사유 필수), `CUSTOM` 줄 추가·삭제, 공제 금액 입력, `payDate` 변경, 정정본이면 `correctionNote`. 계산 줄은 삭제하지 않고 0원으로 둔다.
- **보내기**: 트랜잭션에서 스냅숏 확정 → `SENT` → 같은 기간 이전 `SENT`는 `SUPERSEDED` → 푸시 발송 (트랜잭션 밖, 실패해도 롤백하지 않음, §6).
- `SENT`·`SUPERSEDED`는 수정할 수 없다 (`PAYSLIP_NOT_EDITABLE`). 보존 기간은 퇴사 후 3년 (근기법 §42).

### 4.3 초안 생성과 재계산

**일배치 `payslip-drafts`** (`/api/internal/jobs/[job]`, 매일 06:10, `daily-reviews` 뒤):
- 매장별로 `end ≤ 오늘`인 **최근 3개** 정산 기간에 대해 (사업장 규모 소급 90일을 덮는다), 대상 직원(`payroll` §4 미리보기 대상과 같음) 중 그 기간 Payslip이 하나도 없으면 version 1 DRAFT를 만든다.
- 인정 근무와 수당이 모두 0원인 직원은 만들지 않는다.
- 미해결 항목(퇴근 누락·대기 중 수정 요청)이 있어도 만든다. 화면에 배지로 보인다.

**재계산 트리거** — 그 근태·근로조건이 걸친 기간에 Payslip이 있으면:
- 근태 직접 수정, 수정 요청 승인, 퇴근 누락 처리, 근로조건 새 버전, 사업장 규모 신고 변경.
- 최신이 `DRAFT` → 계산 줄의 `calculatedAmount`를 다시 계산. 사장님이 고치지 않은 줄(`adjustReason` 없음)은 `amount`도 따라간다. 고친 줄은 `amount` 유지, 화면에 "계산값이 바뀌었어요" 표시.
- 최신이 `SENT` → 다시 계산해 계산 줄 하나라도 달라지면 version+1 DRAFT를 만든다. 이전 SENT의 `CUSTOM` 줄·수기 공제·`payDate`·수정한 줄을 복사한다. 달라진 게 없으면 만들지 않는다.
- 그 기간이 끝났고 그 직원 Payslip이 아직 없으면(퇴근 누락만 있어 빠졌던 경우 등) 트리거가 version 1 DRAFT를 만든다.
- 사업장 규모 소급 신고(`store` §6, 최대 90일)는 35일 넘은 기간도 정정본을 만든다. 사장님이 확인하고 보내므로 자동으로 나가지 않는다.
- 재계산은 트리거한 쓰기 트랜잭션 뒤에 실행한다. 실패하면 `needsRecalculation = true` 로 남기고 일배치가 다시 한다.

## 5. 화면

### 5.1 사장님 `/owner/[storeId]/payslips?periodStart=`

1. 기간 선택 (정산 화면과 같은 화살표)
2. 상단 요약: 확인 필요 n · 보냄 n · 정정 필요 n
3. 직원 목록: 이름, 실지급액, 상태 칩(`확인 필요` / `보냄` / `정정본 확인 필요`), 열람 여부(`읽음`), 알림 미수신 배지(푸시 토큰 없음)
4. "확인 필요 모두 보내기" — 확인 시트에 인원·총액. `payDate` 없는 직원이 있으면 막는다.
5. 진입: 대시보드 "처리할 일"에 `명세서 확인 n건`, 정산 화면 상단에 "임금명세서 만들기" 링크.

### 5.2 사장님 상세 `/owner/[storeId]/payslips/[payslipId]`

- 직원 정보·기간·지급일, 근로일수·시간 요약
- 지급 / 공제 표. 금액 탭 → 수정 시트 (금액 + 사유). 계산값과 다르면 `계산값 469,560원` 보조 표시
- "항목 추가" (지급·공제, 이름·금액·계산방법)
- 정정본이면 이전 보낸 본과 바뀐 줄을 강조하고 `correctionNote` 입력(필수)
- 하단 고정 CTA "보내기" / 보낸 뒤엔 "보낸 날짜·읽음 여부"와 이전 버전 링크

### 5.3 직원 `/me/payslips`, `/me/payslips/[payslipId]`

- 목록: 기간, 실지급액, 새 명세서·정정 배지. `SENT`·`SUPERSEDED`만 보인다 (`SUPERSEDED`는 "이전 버전"으로 접힘).
- 상세: §3.1 항목 전부. 처음 열면 `viewedAt` 기록. 정정본이면 상단에 `correctionNote`.
- `/me` 홈에 최신 명세서 카드.

## 6. 푸시 (FCM)

- **전제**: 출근콕 앱은 아직 스토어 출시 전이다 (2026-11-11). 첫 출시 빌드에 FCM을 넣으므로 구버전 앱 대응·강제 업데이트는 없다. Firebase 프로젝트(iOS·Android 앱 등록)와 APNs 키는 구현 착수 전에 준비한다.
- 앱: `@react-native-firebase/app` + `@react-native-firebase/messaging` (Expo config plugin, 개발 빌드). iOS는 APNs 키를 Firebase에 등록.
- 서버: `firebase-admin` 의 `messaging().send()`. 서비스 계정은 환경 변수 `FIREBASE_SERVICE_ACCOUNT` (JSON, 시크릿).
- **권한 요청**: 기기 등록(handoff) 끝난 직후, 그리고 이미 등록된 기기는 업데이트 후 처음 앱을 켤 때 1회, 앱이 안내 화면을 보여 주고 OS 권한을 묻는다. 거절해도 앱은 쓸 수 있다.
- **인증**: `POST /push-tokens` 는 SecureStore의 기기 토큰을 Bearer로 보낸다. `/auth/handoff` 의 기기 토큰 검증을 공통 가드 `requireDeviceBearer` 로 빼서 쓴다.
- **토큰 등록**: 앱이 토큰을 얻거나 갱신되면 `POST /api/v1/push-tokens` (기기 토큰 Bearer, `auth` §5). `deviceCredentialId` 기준 upsert. 기기 재등록·폐기 시 삭제.
- **보내는 알림**

  | 이벤트 | 제목 | 본문 | 열 곳 |
  | --- | --- | --- | --- |
  | 최초 보내기 | `11월 임금명세서가 도착했어요` | `<매장명> · 실지급 1,234,560원` | `/me/payslips/[id]` |
  | 정정본 보내기 | `임금명세서가 정정됐어요` | `<매장명> · 10/1~10/31` | 같음 |

  금액을 잠금 화면에 보이기 싫을 수 있으므로 정정 알림엔 금액을 넣지 않는다. (최초 알림 금액 노출은 사장님 피드백 보고 조정.)
- 알림 탭 → 앱이 data의 `path`로 WebView 이동 (브릿지 `OPEN_PATH` 없이 앱이 직접 URL 로드).
- 발송 실패(`registration-token-not-registered`)면 그 토큰 삭제. 실패는 명세서 교부를 되돌리지 않는다 — 교부는 앱 안에서 열람 가능해진 시점.

## 7. API

| Method | 경로 | 권한 |
| --- | --- | --- |
| GET | `/stores/:storeId/payslips?periodStart=` | Owner·`PAYROLL_READ` |
| GET | `/payslips/:id` | Owner·`PAYROLL_READ`, 본인(SENT·SUPERSEDED만) |
| PATCH | `/payslips/:id` body `{ payDate?, correctionNote? }` | Owner |
| PUT | `/payslips/:id/lines/:lineId` body `{ amount, adjustReason? }` | Owner |
| POST | `/payslips/:id/lines` body `{ kind, label, basis, amount }` | Owner |
| DELETE | `/payslips/:id/lines/:lineId` (`CUSTOM`만) | Owner |
| POST | `/payslips/:id/send` | Owner |
| POST | `/stores/:storeId/payslips/send` body `{ payslipIds }` | Owner |
| PATCH | `/payslips/:id` body `{ deductionType }` | Owner (DRAFT만, §3.3) |
| POST | `/payslips/:id/view` | 본인 (INACTIVE 포함) |
| GET | `/attendance/me/payslips?storeId=` | 본인 |
| POST | `/push-tokens` body `{ token, platform }` | 기기 |

- 쓰기 요청은 공통대로 Zod 검증·권한 가드·멱등 키(보내기).
- 인덱스 §2.5 권한 매트릭스에 "임금명세서 수정·보내기: Owner만", "조회: Owner·`PAYROLL_READ`·본인" 줄 추가.

## 8. 에러 코드

| code | HTTP | 메시지 |
| --- | --- | --- |
| `PAYSLIP_NOT_EDITABLE` | 409 | 이미 보낸 명세서는 고칠 수 없어요. |
| `PAYSLIP_PAY_DATE_REQUIRED` | 400 | 급여 지급일을 넣어 주세요. |
| `PAYSLIP_NET_NEGATIVE` | 400 | 공제가 지급액보다 많아요. |
| `PAYSLIP_ADJUST_REASON_REQUIRED` | 400 | 금액을 바꾼 이유를 적어 주세요. |
| `PAYSLIP_CORRECTION_NOTE_REQUIRED` | 400 | 정정 사유를 적어 주세요. |

## 9. 수용 기준

- [ ] 기간이 끝난 다음 날 06:10 배치 뒤 근무한 직원마다 DRAFT 1건, 근무·수당 0원인 직원은 없음.
- [ ] DRAFT 지급 항목 합이 같은 기간 정산 미리보기의 예상 합계와 같다.
- [ ] `WITHHOLDING_3_3` 직원, 지급 총액 1,234,567원 → 소득세 37,030원, 지방소득세 3,700원.
- [ ] `SOCIAL_INSURANCE` 직원 두 번째 명세서는 직전 보낸 공제 금액으로 채워진다.
- [ ] 계산 줄 금액을 사유 없이 바꾸면 `PAYSLIP_ADJUST_REASON_REQUIRED`.
- [ ] 보내기 후 직원 기기에 푸시가 오고, 탭하면 해당 명세서가 열린다. 처음 열면 사장님 목록에 "읽음".
- [ ] 보낸 뒤 그 기간 수정 요청을 승인하면 version 2 DRAFT가 생기고, 사장님이 사유를 적어 보내면 version 1은 `SUPERSEDED`, 직원에게 정정 알림.
- [ ] 계산 결과가 같은 근태 변경(예: 메모만)은 정정본을 만들지 않는다.
- [ ] Manager(`PAYROLL_READ` 없음)는 조회도 `FORBIDDEN`, `PAYROLL_READ` Manager는 조회만 되고 수정·보내기는 `FORBIDDEN`.
- [ ] 직원은 DRAFT를 볼 수 없다 (`NOT_FOUND`).
- [ ] 푸시 토큰이 없는 직원도 보내기는 성공하고 앱에서 볼 수 있다.

## 10. 남은 결정 (빌더 재량)

- 화면 세부 레이아웃·카피 (DS·stop-slop 규칙 따름)
- 재계산 실행 위치 (각 쓰기 서비스 뒤 직접 호출 vs 공통 훅)
- 4대보험 자동 계산은 P2 후보
