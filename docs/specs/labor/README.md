# 근로조건·법정 검토 — 기능 스펙

| 항목 | 값 |
| --- | --- |
| 상태 | **Draft** (2026-11-03) — 법령 규칙은 노무사 검증 전 (인덱스 Q6) |
| PRD | [§5, §7 EmploymentTerms·LaborReview](../../prd-v0.4.md) |
| 인덱스 | [../README.md](../README.md) |

> 서비스는 법적 판단을 하지 않는다. 입력된 사실에서 **검토가 필요한 항목**을 만들고 안내한다. 모든 안내에 "참고용 안내" 문구를 붙인다.

---

## 1. 개요

1. 근로조건은 **불변 버전**이다. 수정은 새 버전 생성 + 이전 버전 종료.
2. 근로조건을 저장하면 검토 엔진이 돌고, 생성된 검토 항목을 응답에 담는다. 화면은 그중 노출 대상을 바텀시트로 보여 준다.
3. 근무 기록(퇴근, 일배치)에서도 검토 항목이 생긴다 (`attendance` §6).
4. 규칙 값(최저임금, 시간 기준)은 `LaborRuleSet`에서 읽는다.

## 2. 범위 / 비목표

| 포함 (P0) | 제외 |
| --- | --- |
| 근로조건 등록·이력 | 수당 **금액** 계산 (`payroll` §3.6에서 예상액만) |
| `MINIMUM_WAGE`, `BREAK_SHORTAGE`, `WEEKLY_HOLIDAY`, `SHORT_TIME_OVERTIME` | `HOLIDAY_WORK`, `SEVERANCE`, `ANNUAL_LEAVE` (P1) |
| `NIGHT_WORK`, `OVERTIME`, `ABSENCE_SUSPECTED`, 남긴 휴게의 `BREAK_SHORTAGE` (근무 기록 트리거) | 근로계약서 전자 작성 |
| 바텀시트·검토 목록 | 노무사 상담 연결 (P2) |

## 3. 근로조건

### 3.1 입력

```ts
const DailyScheduleInput = z.object({
  weekday: z.number().int().min(0).max(6),        // 0=일
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), // "18:00"
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),   // "02:00" → 익일
  breakMinutes: z.number().int().min(0),
});

const CreateTermsBody = z.object({
  effectiveFrom: z.string().date(),               // 매장 시간대 날짜, 00:00부터 적용
  hourlyWage: z.number().int().positive().max(1_000_000),
  schedules: z.array(DailyScheduleInput).max(7),
  scheduleVaries: z.boolean().default(false),
  averageWeeklyMinutesOverride: z.number().int().min(0).max(52 * 60).nullable().default(null),
  weeklyHolidayWeekday: z.number().int().min(0).max(6).nullable(),
  contractStartDate: z.string().date(),
  contractEndDate: z.string().date().nullable(),
  confirmBelowMinimumWage: z.boolean().default(false),
  deductionType: z.enum(['NONE', 'WITHHOLDING_3_3', 'SOCIAL_INSURANCE']).default('NONE'), // 급여 공제: 없음 / 3.3% / 4대보험 (payslip §3.3)
}).superRefine(/* 아래 검증 */);
```

**검증 (`superRefine`)**

| 규칙 | 메시지 |
| --- | --- |
| `schedules`의 `weekday` 중복 없음 | 같은 요일이 두 번 있어요. |
| `startTime == endTime` 금지 | 출근과 퇴근 시각이 같아요. |
| `breakMinutes < workMinutes` | 휴게시간이 근무시간보다 길어요. |
| `scheduleVaries`면 `averageWeeklyMinutesOverride` 필수 | 주 평균 근무시간을 입력해 주세요. |
| `contractEndDate >= contractStartDate` | 계약 종료일을 확인해 주세요. |
| `effectiveFrom >= contractStartDate` | |

**변환**: `startMinute = HH*60+MM`, `workMinutes = (end - start + 1440) % 1440`.

### 3.2 저장 트랜잭션

1. 직원 Membership `FOR UPDATE` 잠금
2. 최저임금 검사 (§4.1). 미달이고 `confirmBelowMinimumWage = false` → `409 MINIMUM_WAGE_CONFIRM_REQUIRED` (저장 안 함)
3. 현재 열린 버전의 `effectiveTo = effectiveFrom 00:00` (매장 시간대 → UTC)
4. `effectiveFrom`이 현재 열린 버전의 시작보다 이르면 `409 TERMS_EFFECTIVE_BEFORE_CURRENT`
   - 열린 버전에 `effectiveFrom` 이후 출근 기록이 있으면 `409 TERMS_HAS_LATER_ATTENDANCE` — 이미 일한 근무의 시급이 바뀌면 안 된다 ("다음 날부터 적용해 주세요")
   - 같은 날 시작이고 근무 기록이 없으면 열린 버전을 지우고 대체한다 (등록 직후 오타 수정). 버전 번호는 계속 올라간다
5. 새 버전 `version = max + 1` 생성 + schedules
6. 이전 버전 기준 검토 항목 중 `OPEN`·`NEEDS_INFORMATION` → `SUPERSEDED`
7. 검토 엔진 실행 → 새 `LaborReview` upsert
8. 응답 `{ terms, reviews }`

> **이미 지난 근무에 대한 소급 변경** (예: 지난주 시급 정정)은 미지원. 이유: 이미 생성된 근태의 `termsId`를 바꿔야 해서 감사 흐름이 커진다. 우회: 근태 수정 사유에 기록하고 정산에서 수기 조정. P1에서 재검토.

### 3.3 파생값 (저장하지 않음)

```ts
// 하루 근로시간 = 구간 길이 − 휴게
const dailyLaborMinutes = (s: Schedule) => s.workMinutes - s.breakMinutes;

// 주 소정근로시간
const weeklyContractMinutes = (t: Terms) =>
  t.scheduleVaries
    ? t.averageWeeklyMinutesOverride!
    : sum(t.schedules.map(dailyLaborMinutes));

// 단시간근로자: 주 40시간 미만
const isShortTime = (t: Terms) => weeklyContractMinutes(t) < 40 * 60;
```

> `isShortTime`은 "같은 사업장 통상근로자보다 짧은가"가 법적 정의다. MVP는 주 40시간과 비교한다. 노무사 확인 필요 (Q6).

## 4. 검토 엔진 — 근로조건 트리거

입력: 새 근로조건 버전, 적용 `LaborRuleSet`(`effectiveFrom` 날짜 기준 최신), 해당 날짜의 사업장 규모.

| 유형 | 생성 조건 | `reasonCode` | 상태 |
| --- | --- | --- | --- |
| `MINIMUM_WAGE` | `hourlyWage < rule.minimumHourlyWage` | `BELOW_MINIMUM` | `OPEN` |
| `BREAK_SHORTAGE` | 어떤 요일이든 `breakMinutes < requiredBreak(dailyLaborMinutes)` | `DAY_<weekday>` 중 첫 요일 | `OPEN` |
| `WEEKLY_HOLIDAY` | `weeklyContractMinutes >= 900` 이고 `weeklyHolidayWeekday != null` | `ELIGIBLE` | `OPEN` |
| `WEEKLY_HOLIDAY` | `weeklyContractMinutes >= 900` 이고 `weeklyHolidayWeekday == null` | `HOLIDAY_NOT_SET` | `NEEDS_INFORMATION` |
| `SHORT_TIME_OVERTIME` | `isShortTime` 이고 `weeklyContractMinutes > 0` | `SHORT_TIME` | `OPEN` |

```ts
// 근기법 §54: 4시간 → 30분, 8시간 → 1시간
const requiredBreak = (laborMinutes: number) =>
  laborMinutes >= 480 ? 60 : laborMinutes >= 240 ? 30 : 0;
```

> `requiredBreak`의 입력은 휴게를 뺀 근로시간이다. 18:00–02:30(510분), 휴게 30분 → 근로 480분 → 필요 60분 → 부족.

- `sourceType = EMPLOYMENT_TERMS`, `sourceId = terms.id`, `ruleVersion = rule.version`.
- 유니크 `(membershipId, type, sourceType, sourceId)` 로 upsert. 같은 버전은 한 번만 만들어진다.

### 4.1 최저임금 규칙 세트

- `LaborRuleSet.effectiveFrom <= 날짜` 중 최신. 없으면 서버 오류(`INTERNAL`) — 배포 전 시드 필수.
- 새 연도 규칙을 넣으면 일배치가 **현재 열린 근로조건 전체**를 다시 평가해 `MINIMUM_WAGE`를 만든다 (`sourceId = terms.id`). 유니크 키에 `ruleVersion`이 있어 같은 사유라도 새 행이 생긴다.

## 5. 검토 엔진 — 근무 기록 트리거

`attendance` §6에서 호출. 요약:

| 유형 | 시점 | 조건 |
| --- | --- | --- |
| `NIGHT_WORK` | 퇴근 확정 | 인정 구간이 22:00–06:00과 1분 이상 겹침 |
| `BREAK_SHORTAGE` | 퇴근 확정 | 기록된 휴게(1분 이상 또는 열린 휴게, `payroll` §3.2)가 있는 근무(`attendance` §3.6)만. 남긴 휴게 합계(근무 안 부분, 분) `< requiredBreak(근무분 − 휴게분)` (§4 함수 재사용). 남긴 휴게가 없으면 근무 기록으로 판단하지 않는다 — 근로조건 검토(§4)가 맡는다 |
| `OVERTIME` | 퇴근 확정 | 통상: 그날 인정 > 480분 또는 그 주 누적 > 2400분. 단시간: 그날 인정 > 그 요일 소정 근로분 |
| `ABSENCE_SUSPECTED` | 매일 06:00 일배치 | 전날이 소정 근무 요일인데 출근 기록 없음 (계약기간 안, `scheduleVaries = false`) |

- `sourceType = ATTENDANCE`, `sourceId = attendance.id`. `ABSENCE_SUSPECTED`는 `sourceType = PAY_PERIOD`, `sourceId = "<membershipId>:<YYYY-MM-DD>"`.
- 근무 기록이 수정되면 해당 `sourceId` 항목을 다시 평가한다. 조건이 사라지면 `RESOLVED`, 다시 해당하면 다시 `OPEN`. 이미 `ACKNOWLEDGED`인 항목은 건드리지 않는다.
- 평가 시점: 퇴근 punch 커밋 뒤, 관리자 근태 수정 뒤, 수정 요청 승인 뒤. 실패해도 응답은 막지 않고 일배치가 최근 2일 퇴근 근무를 다시 평가한다.
- `OVERTIME`의 인정 시간도 남긴 휴게가 있으면 남긴 휴게를 뺀 값이다 (`payroll` §3.2).
- `reasonCode`: `NIGHT:<날짜>`, `RECORDED:<날짜>`(`BREAK_SHORTAGE`), `DAILY_OVER_8H|WEEKLY_OVER_40H|SHORT_TIME_DAILY:<날짜>`, `ABSENCE:<날짜>`. 문구는 날짜를 넣어 만든다 (§6.3).
- 일배치 실행: `GET|POST /api/internal/jobs/daily-reviews` (`Authorization: Bearer <CRON_SECRET>`), 매일 06:00 KST.

## 6. 노출 규칙

### 6.1 상태 전이

```
OPEN ─────────확인했어요────────▶ ACKNOWLEDGED
NEEDS_INFORMATION ─정보 입력(새 버전)─▶ SUPERSEDED
OPEN/NEEDS_INFORMATION ─조건 해소─▶ RESOLVED
OPEN/NEEDS_INFORMATION ─새 버전─▶ SUPERSEDED
ACKNOWLEDGED ─새 ruleVersion 재평가─▶ (새 행 OPEN)
```

`ACKNOWLEDGED`는 "사장님이 안내를 봤다"는 뜻이다. 화면 어디에서도 "해당 없음"으로 표시하지 않는다.

### 6.2 표시 방식

| 유형 | 사업장 규모 `UNKNOWN` | `UNDER_5` | `FIVE_OR_MORE` |
| --- | --- | --- | --- |
| `MINIMUM_WAGE` | 저장 전 확인 다이얼로그 + 바텀시트 | 같음 | 같음 |
| `BREAK_SHORTAGE`, `WEEKLY_HOLIDAY` | 바텀시트 | 바텀시트 | 바텀시트 |
| `SHORT_TIME_OVERTIME`, `NIGHT_WORK`, `OVERTIME` | 바텀시트 + 규모 입력 유도 | **배지만** (검토 목록 회색) | 바텀시트 |
| `ABSENCE_SUSPECTED` | 검토 목록만 | 같음 | 같음 |

- 근무 기록 트리거 항목의 규모 판정은 **근무일 기준** 신고값 (`store` §6.2).
- 바텀시트는 근로조건 저장 직후, 또는 Owner가 대시보드·직원 상세에 들어올 때 **아직 본 적 없는 `OPEN` 항목**이 있으면 1회. 본 적 여부는 `LaborReview.seenAt`.
- 여러 개면 한 바텀시트에 목록으로 (최대 3개 + "외 n건").

### 6.3 문구

| 유형 / reasonCode | 제목 | 본문 |
| --- | --- | --- |
| `MINIMUM_WAGE` | 최저임금보다 낮아요 | 입력한 시급이 {연도}년 최저임금({금액}원)보다 낮아요. 시급을 확인해 주세요. |
| `BREAK_SHORTAGE` / `DAY_<요일>` | 휴게시간이 부족해요 | {요일} 근무에 법정 휴게시간이 부족해요. 4시간마다 30분 이상 쉬어야 해요. |
| `BREAK_SHORTAGE` / `RECORDED:<날짜>` | 휴게시간이 부족해요 | {날짜} 근무에 남긴 휴게가 법정 휴게시간보다 짧아요. 4시간마다 30분 이상 쉬어야 해요. |
| `WEEKLY_HOLIDAY` / `ELIGIBLE` | 주휴수당 대상일 수 있어요 | 입력한 근로조건에 따르면 주휴수당 적용 대상일 수 있어요. 소정근로일을 다 나오면 주휴일에 하루치 임금이 생겨요. |
| `WEEKLY_HOLIDAY` / `HOLIDAY_NOT_SET` | 주휴일을 정해 주세요 | 주 15시간 이상 일하는 직원이에요. 주휴일을 정하면 주휴수당 예상액을 알려드릴 수 있어요. |
| `SHORT_TIME_OVERTIME` | 정한 시간을 넘기면 가산수당이 생길 수 있어요 | 단시간 근로자는 정한 시간을 넘겨 일하면 5인 이상 사업장에서 가산수당이 생길 수 있어요. |
| `NIGHT_WORK` | 야간근무 기록이 있어요 | {날짜} 야간근무 기록이 확인되었어요. 사업장 조건에 따라 야간근로 가산수당이 발생할 수 있어요. |
| `OVERTIME` | 연장근로인지 확인해 주세요 | 설정한 근로시간을 초과한 기록이 있어요. 연장근로에 해당하는지 확인해 주세요. |
| `ABSENCE_SUSPECTED` | 출근 기록이 없는 근무일이 있어요 | {날짜}은 근무일인데 출근 기록이 없어요. 결근이면 주휴수당에 영향을 줄 수 있어요. |
| `UNDER_5` 배지 | | 5인 미만 사업장은 가산수당 의무가 없지만, 기록은 보관돼요. |

공통 하단: "참고용 안내예요. 정확한 판단은 노무사와 상의해 주세요."

CTA: `확인했어요` → `ACKNOWLEDGED` / `근로조건 수정` → 근로조건 폼 / `나중에` → 닫기 (`seenAt`만 기록).

## 7. 화면

| 위치 | 요소 |
| --- | --- |
| 직원 상세 › 근로조건 | 현재 버전 요약(시급, 요일별 시간, 주 소정시간, 주휴일, 계약기간), "수정" → 폼, 이전 버전 목록 |
| 근로조건 폼 | 시급 (최저임금 실시간 안내), 요일 토글 + 시간 선택 + 휴게, "주마다 달라요" 토글, 주휴일, 계약기간, 적용 시작일 |
| 직원 상세 › 검토 | 항목 목록 (상태 배지), 탭 시 바텀시트 |
| 대시보드 | "검토 필요 n건" 카드 (`dashboard`) |

## 8. API

| Method | Endpoint | 권한 |
| --- | --- | --- |
| POST | `/stores/:storeId/members/:id/employment-terms` | Owner, `TERMS_EDIT` |
| GET | `/stores/:storeId/members/:id/employment-terms` | Owner, `PAYROLL_READ`, `TERMS_EDIT`, 본인 |
| GET | `/stores/:storeId/labor-reviews?status=OPEN&type=` | Owner, `PAYROLL_READ`, `TERMS_EDIT` |
| GET | `/stores/:storeId/members/:id/labor-reviews` | 같음 |
| PATCH | `/labor-reviews/:id` | 같음. body `{ status: 'ACKNOWLEDGED' }` 또는 `{ seen: true }` |
| GET | `/labor-rules/current?date=` | 로그인 — 최저임금 표시용 |

## 9. 에러 코드

| code | HTTP | 메시지 |
| --- | --- | --- |
| `MINIMUM_WAGE_CONFIRM_REQUIRED` | 409 | 최저임금보다 낮은 시급이에요. 그래도 저장할까요? (`details.minimumHourlyWage`) |
| `TERMS_EFFECTIVE_BEFORE_CURRENT` | 409 | 현재 근로조건 시작일보다 이전 날짜로는 바꿀 수 없어요. |
| `TERMS_HAS_LATER_ATTENDANCE` | 409 | 적용 시작일 이후의 근무 기록이 있어요. 다음 날부터 적용해 주세요. |
| `TERMS_OVERLAP` | 409 | DB exclusion 위반 시. 재시도 안내 |
| `LABOR_REVIEW_STATUS_INVALID` | 409 | `SUPERSEDED`·`RESOLVED` 항목은 확인 처리할 수 없어요. |

## 10. 수용 기준

- [ ] 시급 10,000원(2026 최저 10,320원) 저장 시도 → `MINIMUM_WAGE_CONFIRM_REQUIRED`. 확인 후 저장되고 `MINIMUM_WAGE` OPEN 1건.
- [ ] 월·수·금 18:00–23:00 휴게 0분 → 근로 300분 → `BREAK_SHORTAGE`. 주 900분 → `WEEKLY_HOLIDAY`(주휴일 미지정이면 `NEEDS_INFORMATION`). 주 40h 미만 → `SHORT_TIME_OVERTIME`.
- [ ] 18:00–02:00 입력이 `workMinutes = 480`으로 저장된다.
- [ ] 같은 내용으로 저장해도 새 버전이 생기고, 이전 버전 OPEN 항목은 `SUPERSEDED`.
- [ ] `UNDER_5` 매장에서 `NIGHT_WORK`는 바텀시트가 뜨지 않고 배지만 보인다. 항목 자체는 생성된다.
- [ ] `ACKNOWLEDGED` 항목이 "해당 없음"으로 표시되는 화면이 없다.
- [ ] 2027 규칙 세트를 추가하면 일배치 후 미달 직원에게 새 `MINIMUM_WAGE`가 생긴다.
- [ ] 09:00–14:00 근무에 12:00–12:20 휴게를 남기면 그 근무에 `BREAK_SHORTAGE`(`RECORDED:<날짜>`). 12:30까지로 고치면 `RESOLVED`.
