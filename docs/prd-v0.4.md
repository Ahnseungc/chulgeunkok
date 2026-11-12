# PRD v0.4 — QR 기반 소규모 매장 근태관리 SaaS

**문서 상태:** 개발 설계 초안 (v0.3 리뷰 반영)
**제품명:** 출근콕
**디자인 시스템:** Seed Design
**기술 스택:** Next.js, React, TypeScript, PostgreSQL, Prisma (제안)
**플랫폼:** 모바일 웹 우선, 관리자 데스크톱 지원
**비즈니스 모델:** 매장 단위 월 구독

> 본 문서의 법령 해석은 설계용 가정이며, 출시 전 공인노무사 검토를 받는다. 서비스는 노무 판단을 대신하지 않고 "검토가 필요한 시점"을 안내한다.

---

## 0. v0.3 → v0.4 변경 요약

| # | 리뷰 지적 | v0.4 반영 |
|---|---|---|
| 1 | 주 단위 소정시간만으로는 1일 연장·단시간·휴게 판단 불가 | `EmploymentTerms`를 **요일별 근무 스케줄** 구조로 변경 (§7) |
| 2 | 휴게 차감(P0)과 휴게 UX(미확정) 충돌 | **소정 휴게 자동 차감 + "휴게 못 함" 신고** 정책 확정 (§6.2) |
| 3 | 최저임금·법정 휴게 미달 검토 누락 | P0 `LABOR-04`, `LABOR-05` 추가 |
| 4 | 휴일근로·퇴직금·연차 누락 | 법 적용 매트릭스에 추가, P1 검토 항목 (§5.1) |
| 5 | 5인 미만 확인 매장에도 야간·연장 안내 반복 → 경고 피로 | 사업장 규모 신고값에 따라 **안내 문구 분기** (§5.6) |
| 6 | 주휴 개근 판단에 근무표(P2) 필요 | 요일별 스케줄을 근무표 대용으로 사용, 미출근 = "결근 의심" |
| 7 | 출근/퇴근 선택 → 오탭 | 서버 상태 기반 **자동 토글** (§3.3) |
| 8 | `CorrectionRequest`·사업장 규모 이력 엔티티 누락 | 엔티티 추가 (§7) |
| 9 | `LaborReview` 재노출·중복 규칙 구현 불가 | dedupe key, 트리거 출처, `ruleVersion` 추가 |
| 10 | 시급 이력 두 테이블 분리로 경계 불일치 위험 | 시급을 `EmploymentTerms` 버전에 통합 |
| 11 | clock-in API에 QR 토큰 없음, 재시도 중복 | `qrToken` 필수, `Idempotency-Key` (§8) |
| 12 | 정적 QR 원격 공유 | 출근 위치 **기록·표시(차단 없음)** P0, 매장 태블릿 동적 QR P1 |
| 13 | "활성 직원" 과금 기준 미정 | "해당 월 출근 기록 1건 이상" 으로 정의 (§10) |
| 14 | 개인정보 보관 기간 미정 | 퇴사 후 3년 보관 후 파기 (§9) |
| 15 | 반올림 정책 미정 | 직원·정산기간 합계에서 1회, 원 미만 **올림** (§6.1) |

---

## 1. 제품 비전

**스티커 하나로 시작하는, 작은 가게를 위한 직원 관리 서비스.**

소규모 음식점, 카페, 주점의 사장님이 QR 스티커 하나로 직원 출퇴근을 기록하고, 근무시간과 예상 급여를 관리하며, 법정 의무를 놓치기 전에 안내받는다.

### 핵심 가치 (지불 근거 순)

1. **월말 정산 시간 절약** — 수기 장부·카톡 대조 없이 기간별 근무시간·예상 기본급 확정
2. **법정 의무 누락 방지** — 최저임금, 휴게, 주휴수당 등 검토 시점 안내
3. 별도 하드웨어 없이 도입
4. 실시간 근무 현황 확인

> 출퇴근 기록 자체는 무료 대체재가 많다. 유료 전환 근거는 1·2번이며, Phase 1 인터뷰도 이 축으로 검증한다.

## 2. 사용자 및 권한

| 사용자 | 주요 권한 |
|---|---|
| Owner | 매장 생성, 직원·근로조건 관리, 근태 수정·승인, 급여 조회, 사업장 규모 신고, 구독 관리 |
| Manager | 위임받은 매장의 근태 조회·승인, 직원 초대. **급여·시급 조회와 구독은 기본 불가** (Owner가 권한 부여 시 허용) |
| Employee | 출퇴근, 본인 기록·예상 급여 조회, 수정 요청, "휴게 못 함" 신고 |

- 모든 접근 권한은 서버에서 `Membership(storeId, role, status=ACTIVE)` 기준으로 검증한다.
- Manager 권한은 `Membership.permissions` (예: `PAYROLL_READ`) 로 세분화한다.

## 3. 핵심 사용자 흐름

### 3.1 매장 등록

1. 사장님 회원가입·로그인 (카카오 또는 휴대폰 인증)
2. 매장 정보 등록 (이름, 주소, 시간대)
3. **사업장 규모 신고**: `5인 미만` / `5인 이상` / `잘 모르겠어요` 중 선택 + 산정 기준 안내 (§5.5)
4. 매장 전용 QR 코드 생성
5. QR 스티커 출력 및 부착

### 3.2 직원 등록 및 근로조건 설정

1. 사장님이 직원 초대 (링크 또는 휴대폰 번호)
2. 직원이 초대 링크로 가입 (1회용, 7일 만료)
3. 사장님이 근로조건 입력
   - 시급
   - **요일별 근무시간·휴게시간** (예: 월·수·금 18:00–23:00, 휴게 30분)
   - 주휴일
   - 계약 시작일·종료일
4. 저장 시 시스템이 검토 항목 생성 (§5)
5. 검토 항목이 있으면 바텀시트 표시. **저장은 막지 않는다** (최저임금 미달만 예외, §5.2)
6. 직원 등록 완료

### 3.3 출퇴근

1. 직원이 매장 QR 스캔
2. 로그인 및 매장 소속 검증
3. 서버가 진행 중 근무 여부로 **출근/퇴근 자동 판별** → "출근할까요?" / "퇴근할까요?" 확인 1탭
4. 서버 시간 기준 저장. 브라우저 위치 권한이 있으면 위치도 함께 기록
5. 완료 화면 (시각, 매장명). 네트워크 실패 시 재시도해도 중복 없이 같은 결과 표시
6. 관리자 대시보드 반영

**예외 흐름**
- 퇴근 누락: 소정 종료 + 4시간 경과 시 `MISSING_CLOCK_OUT` 상태로 전환 → 직원 수정 요청 유도
- 매장 반경 밖 출근: 기록은 저장하고 관리자 화면에 "매장 밖 기록" 배지 표시 (차단하지 않음)

### 3.4 월말 정산

1. 사장님이 정산 기간 선택 (기본: 매월 1일~말일, 매장별 설정 가능)
2. 미해결 항목 먼저 표시: 퇴근 누락, 대기 중 수정 요청, "휴게 못 함" 신고
3. 직원별 인정 근무시간·예상 기본급 확인
4. 법정수당 검토 항목 확인
5. CSV 내보내기 (미해결 항목이 있으면 경고 후 진행 가능)

## 4. MVP 기능 요구사항

### P0 — 파일럿 출시 필수

| ID | 기능 | 요구사항 |
|---|---|---|
| AUTH-01 | 인증 | 카카오·휴대폰 OTP 로그인, 세션 관리. 이메일 선택 |
| STORE-01 | 매장 관리 | 매장 생성·수정, 시간대, 정산 기간 시작일 |
| STORE-02 | QR 발급 | QR 생성·출력·재발급(기존 토큰 즉시 폐기) |
| STORE-03 | 사업장 규모 신고 | 규모 구간 신고·이력 관리 (§5.5) |
| STAFF-01 | 직원 초대 | 1회용 초대 링크 발급·수락 |
| STAFF-02 | 직원 관리 | 활성화·비활성화, 과거 기록 유지 |
| LABOR-01 | 근로조건 | 시급·요일별 스케줄·휴게·주휴일·계약기간, 버전 이력 |
| LABOR-03 | 수당 안내 | 검토 항목별 바텀시트 (§5) |
| LABOR-04 | 최저임금 검토 | 시급 입력 시 해당 연도 최저임금 미달 경고 |
| LABOR-05 | 휴게 검토 | 근무 4시간당 30분 미만 휴게 스케줄 경고 |
| TIME-01 | 출퇴근 | 서버 시간 기준, 자동 토글, 멱등 처리, 위치 기록 |
| TIME-02 | 근무시간 | 소정 휴게 자동 차감, 인정 근무시간 계산, 자정·기간 경계 분할 |
| TIME-03 | 기록 수정 | 직원 요청 → 관리자 승인/반려, 관리자 직접 수정, 감사 로그 |
| TIME-04 | 퇴근 누락 처리 | `MISSING_CLOCK_OUT` 자동 전환, 정산 화면 노출 |
| PAY-01 | 예상 기본급 | 인정 근무시간 × 적용 시급 (§6.1) |
| ADMIN-01 | 대시보드 | 현재 근무 인원, 오늘 기록, 미해결 항목 |
| ADMIN-02 | 내보내기 | 기간별 CSV |

### P1 — 유료화 및 계산 고도화

- 구독 결제 및 직원 추가 과금
- 주휴수당 예상액 계산
- 야간·연장·휴일근로 가산수당 예상액 계산 (5인 이상 신고 매장)
- 퇴직금 대상 안내 (1년 이상 + 4주 평균 주 15시간 이상)
- 연차휴가 발생 안내 (5인 이상)
- **임금명세서 생성·교부** (근로기준법 §48②, 전 사업장 의무)
- 실제 휴게 시작·종료 기록 (선택 기능) — **파일럿 반영 (2026-11-12)**: 직원이 근무 카드에서 휴게 시작·끝을 남기면 소정 휴게 대신 그 시간을 뺀다 (attendance §3.6, payroll §3.2)
- 매장 태블릿 키오스크: 동적 QR + 개인 PIN (스마트폰 미사용 직원 대응)
- 퇴근 누락 푸시·문자 알림
- 사업장 규모 참고 추정치 (출근 기록 기반, §5.5) — **파일럿 반영 (2026-11-12)**: 직전 달 평균을 설정·대시보드에 참고로 보여 준다 (store §6.4)

### P2 — 운영 기능 확장

- 직원 공지사항
- 근무표 작성 및 공유 (주 단위 변동 스케줄)
- 교대근무 변경 요청
- 인건비 분석
- 다점포 통합 관리
- 노무사 상담 연결

## 5. 법정수당·근로조건 안내

### 5.1 법 적용 매트릭스 (설계 기준)

| 항목 | 5인 미만 | 5인 이상 | 판단에 필요한 데이터 | 단계 |
|---|---|---|---|---|
| 최저임금 | 적용 | 적용 | 시급, 연도별 최저임금 | P0 |
| 휴게시간 (4h당 30분, 8h당 1시간) | 적용 | 적용 | 요일별 근무·휴게 | P0 |
| 주휴수당 (4주 평균 주 15h 이상 + 개근) | 적용 | 적용 | 요일별 소정시간, 결근 기록 | 안내 P0 / 계산 P1 |
| 퇴직금 (1년 이상 + 주 15h 이상) | 적용 | 적용 | 계약 시작일, 소정시간 | P1 |
| 임금명세서 교부 | 적용 | 적용 | 지급 내역 | P1 |
| 야간근로 가산 (22:00–06:00, 50%) | 미적용 | 적용 | 실제 근무 구간 | 안내 P0 / 계산 P1 |
| 연장근로 가산 — 통상근로자 (1일 8h·1주 40h 초과) | 미적용 | 적용 | 실제 근무시간 | 안내 P0 / 계산 P1 |
| 연장근로 가산 — 단시간근로자 (소정시간 초과) | 미적용 | 적용 | 요일별 소정시간 | 안내 P0 / 계산 P1 |
| 휴일근로 가산 (8h 이내 50%, 초과 100%) | 미적용 | 적용 | 주휴일, 실제 근무 | P1 |
| 연차휴가 | 미적용 | 적용 | 근속, 출근율 | P1 |

규칙 데이터(최저임금, 비율, 시간 기준)는 코드에 하드코딩하지 않고 `LaborRuleSet(version, effectiveFrom)` 으로 관리한다.

### 5.2 기본 원칙

- **법정수당 지급 의무를 켜거나 끄는 설정은 제공하지 않는다.** 사용자는 사실(근로조건, 사업장 규모)을 입력하고, 시스템은 그 사실로 검토 항목을 만든다.
- 근로조건 저장을 막지 않는다. 단, **최저임금 미달은 저장 전 확인 다이얼로그**를 1회 띄운다 (명백한 위법이므로).
- 정보가 부족하면 `NEEDS_INFORMATION` 으로 저장하고 나중에 완료할 수 있게 한다.
- 미확인 상태를 "지급 대상 아님"으로 해석하지 않는다.
- 동일 안내를 반복하지 않는다. 같은 `(직원, 유형, 트리거 출처)` 는 1회만 노출하고, 근로조건 버전이 바뀌거나 새 근무 기록이 트리거되면 재노출한다.
- 모든 안내에 "법적 판단이 아닌 참고용 안내" 문구와 상세 설명 링크를 둔다.

### 5.3 근로조건 저장 시 안내

| 유형 | 조건 | 문구 |
|---|---|---|
| `MINIMUM_WAGE` | 시급 < 해당 연도 최저임금 | "입력한 시급이 올해 최저임금(○○원)보다 낮아요. 시급을 확인해 주세요." |
| `BREAK_SHORTAGE` | 근무 4h 이상인 요일에 휴게 부족 | "○요일 근무에 법정 휴게시간이 부족해요. 4시간마다 30분 이상 쉬어야 해요." |
| `WEEKLY_HOLIDAY` | 주 소정시간 합계 ≥ 15시간 | "입력한 근로조건에 따르면 주휴수당 적용 대상일 수 있어요. 주휴일과 근무 조건을 확인해 주세요." |
| `SHORT_TIME_OVERTIME` | 5인 이상 + 단시간근로자 | "단시간 근로자는 정한 시간을 넘겨 일하면 가산수당이 생길 수 있어요." |

주휴 판단은 MVP에서 요일별 스케줄 합계로 한다. 주마다 스케줄이 다른 경우(근무표 P2 이전)는 사장님이 "주마다 달라요"를 선택하면 4주 평균 시간을 직접 입력받는다.

### 5.4 근무 기록 발생 시 안내 (일배치 + 정산 화면)

| 유형 | 조건 |
|---|---|
| `NIGHT_WORK` | 22:00–06:00 구간 근무 발생 |
| `OVERTIME` | 1일 8h 또는 1주 40h 초과 (통상), 소정시간 초과 (단시간) |
| `HOLIDAY_WORK` | 주휴일 근무 발생 (P1) |
| `ABSENCE_SUSPECTED` | 소정 근무일에 출근 기록 없음 → 주휴 개근 판단 참고 |

### 5.5 사업장 규모 신고

- 매장 등록 시 `UNDER_5` / `FIVE_OR_MORE` / `UNKNOWN` 중 선택. 산정 방법(직전 1개월 근로자 연인원 ÷ 가동일수, 근기법 시행령 §7의2)을 바텀시트로 안내한다.
- 등록 직원 수를 상시근로자 수로 자동 간주하지 않는다.
- 신고값은 이력(`StoreHeadcountDeclaration`)으로 관리하고, 근무일 기준 당시 유효한 신고값을 적용한다.
- P1: 출근 기록으로 연인원 ÷ 가동일수 **참고 추정치**를 계산해, 신고값과 다르면 "재확인" 안내만 한다. 자동으로 바꾸지 않는다.

### 5.6 사업장 규모에 따른 안내 분기

| 신고값 | 야간·연장·휴일 안내 |
|---|---|
| `UNKNOWN` | 노출 + "사업장 규모를 알려주시면 더 정확하게 안내해 드려요" |
| `UNDER_5` | 바텀시트 대신 기록 화면에 정보 배지만: "5인 미만 사업장은 가산수당 의무가 없지만, 기록은 보관돼요" |
| `FIVE_OR_MORE` | 바텀시트 노출 |

신고 사실에 따른 분기이며, 의무 on/off 설정이 아니다.

### 5.7 바텀시트 동작 규칙

- Seed Design `BottomSheet` 와 토큰을 우선 사용한다.
- CTA는 `확인했어요` / `근로조건 수정` / `나중에` 세 가지.
- `확인했어요` → `ACKNOWLEDGED` (관리자가 안내를 확인함. 지급 의무가 없다는 뜻이 아니다).
- `나중에` → 상태 유지, 대시보드 "검토 필요" 목록에 남는다.

## 6. 근무시간·급여 계산 정책

### 6.1 예상 기본급

```
인정 근무분 = (퇴근 − 출근) − 차감 휴게분
예상 기본급 = Σ(근무 구간별 인정 근무분 × 적용 시급) ÷ 60
```

- 서버 시간 기준. 저장은 UTC, 계산·분할은 `Store.timezone` 기준
- 적용 시급 = **출근 시각에 유효한** `EmploymentTerms` 버전의 시급. 근무 중 시급이 바뀌어도 한 근무는 한 시급
- 근무가 자정 또는 정산 기간 경계를 넘으면 경계에서 분할해 각 기간에 귀속
- `OPEN`, `MISSING_CLOCK_OUT` 근무는 합계에서 제외하고 별도 표시
- 분 단위 계산, 단위 절사 금지 (5분·30분 단위 버림 금지)
- 금액은 원 단위 정수로 저장. **직원·정산기간 합계에서 1회, 원 미만 올림** (근로자 불이익 방지)

### 6.2 휴게시간 정책 (MVP 확정)

1. 근로조건의 요일별 **소정 휴게시간을 자동 차감**한다.
2. 실제로 휴게를 못 했다면 직원이 퇴근 화면 또는 기록 화면에서 **"휴게 못 함"** 을 신고한다.
3. 신고는 수정 요청과 같은 흐름으로 관리자가 승인하면 차감이 취소된다.
4. 근무가 소정보다 짧아 휴게 구간에 걸리지 않으면 비례 차감하지 않고, 실제 근무 4시간 미만이면 차감하지 않는다.
5. P1에서 실제 휴게 시작·종료 기록을 선택 기능으로 제공한다. (파일럿 반영: 남긴 휴게가 있으면 1·2 대신 남긴 시간을 뺀다 — attendance §3.6)

> 휴게를 주지 않았는데 자동 차감하면 임금체불이 되므로, 2번의 신고 경로가 반드시 함께 출시되어야 한다.

### 6.3 예상 법정수당 (P1)

- 예상 주휴수당 = min(주 소정시간 ÷ 40, 1) × 8시간 × 시급, 해당 주 개근 시
- 예상 야간·연장·휴일 가산수당: 5인 이상 신고 기간에만 계산
- 모든 금액은 "예상"으로 표시하고 실제 지급액과 구분한다
- 계산 규칙은 노무사 검증 후 `LaborRuleSet` 버전으로 배포한다

## 7. 데이터 모델

### 핵심 엔티티

| 엔티티 | 주요 필드 |
|---|---|
| User | id, name, phone, email?, kakaoId? |
| Store | id, name, address, lat?, lng?, timezone, payPeriodStartDay, status |
| Membership | id, storeId, userId, role, permissions[], status, joinedAt, leftAt? |
| StoreQrToken | id, storeId, tokenHash, createdAt, revokedAt? |
| StoreInvitation | id, storeId, tokenHash, role, expiresAt, acceptedAt?, acceptedBy? |
| StoreHeadcountDeclaration | id, storeId, band, effectiveFrom, declaredBy, note? |
| EmploymentTerms | id, membershipId, version, effectiveFrom, effectiveTo?, hourlyWage, weeklySchedule, weeklyHolidayWeekday?, contractStartDate, contractEndDate? |
| Attendance | id, storeId, membershipId, termsId, clockInAt, clockOutAt?, status, clockInLocation?, breakWaived |
| CorrectionRequest | id, attendanceId, requesterId, type, proposed, reason, status, decidedBy?, decidedAt? |
| AttendanceRevision | id, attendanceId, actorId, before, after, reason, correctionRequestId?, createdAt |
| LaborReview | id, membershipId, type, status, sourceType, sourceId, ruleVersion, reasonCode, acknowledgedBy?, acknowledgedAt? |
| LaborRuleSet | id, version, effectiveFrom, minimumHourlyWage, rules(JSON) |
| Subscription | id, storeId, plan, status, periodStart, periodEnd |

- 기존 `WageHistory` 는 `EmploymentTerms.hourlyWage` 로 통합한다 (유효기간 경계 단일화).
- `AttendanceBreak(id, attendanceId, startAt, endAt?, createdAt)` 는 실제 휴게 기록과 함께 도입했다 (마이그레이션 0008, attendance §3.6).

### EmploymentTerms

```typescript
type DailySchedule = {
  weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = 일요일
  startTime: string;                  // "18:00" (매장 시간대)
  endTime: string;                    // "02:00" → 익일
  breakMinutes: number;
};

type EmploymentTerms = {
  id: string;
  membershipId: string;
  version: number;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  hourlyWage: number;                 // 원, 정수
  weeklySchedule: DailySchedule[];
  scheduleVaries: boolean;            // 주마다 다름
  averageWeeklyMinutesOverride: number | null; // scheduleVaries일 때 입력
  weeklyHolidayWeekday: number | null;
  contractStartDate: Date;
  contractEndDate: Date | null;
};
```

파생값(`weeklyContractMinutes`, `isShortTime`)은 저장하지 않고 계산한다.

### Attendance

```typescript
type AttendanceStatus =
  | 'OPEN'               // 근무 중
  | 'CLOSED'             // 정상 종료
  | 'MISSING_CLOCK_OUT'  // 퇴근 누락 자동 전환
  | 'VOID';              // 관리자 무효 처리

type Attendance = {
  id: string;
  storeId: string;
  membershipId: string;
  termsId: string;       // 출근 시점 유효 근로조건
  clockInAt: Date;
  clockOutAt: Date | null;
  status: AttendanceStatus;
  clockInLocation: { lat: number; lng: number; accuracyM: number } | null;
  breakWaived: boolean;  // "휴게 못 함" 승인 시 true
};
```

**제약**
- 직원당 진행 중 근무 1개: `CREATE UNIQUE INDEX ... ON attendance(membership_id) WHERE status = 'OPEN'` (Prisma 스키마 미지원 → raw migration)
- `clockOutAt > clockInAt` CHECK 제약

### LaborReview

```typescript
type LaborReviewType =
  | 'MINIMUM_WAGE'
  | 'BREAK_SHORTAGE'
  | 'WEEKLY_HOLIDAY'
  | 'SHORT_TIME_OVERTIME'
  | 'NIGHT_WORK'
  | 'OVERTIME'
  | 'HOLIDAY_WORK'       // P1
  | 'ABSENCE_SUSPECTED'
  | 'SEVERANCE'          // P1
  | 'ANNUAL_LEAVE';      // P1

type LaborReviewStatus =
  | 'OPEN'
  | 'NEEDS_INFORMATION'
  | 'ACKNOWLEDGED'       // 관리자가 안내를 확인함 (지급 의무 없음 아님)
  | 'RESOLVED'           // 근로조건 변경으로 해소
  | 'SUPERSEDED';        // 새 근로조건 버전으로 대체

type LaborReview = {
  id: string;
  membershipId: string;
  type: LaborReviewType;
  status: LaborReviewStatus;
  sourceType: 'EMPLOYMENT_TERMS' | 'ATTENDANCE' | 'PAY_PERIOD';
  sourceId: string;
  ruleVersion: string;
  reasonCode: string;
  acknowledgedBy: string | null;
  acknowledgedAt: Date | null;
};
```

- 유니크: `(membershipId, type, sourceType, sourceId)` → 같은 사유 재노출 방지
- `LaborRuleSet` 새 버전 배포 시 `OPEN`·`ACKNOWLEDGED` 항목 재평가

### StoreHeadcountDeclaration

```typescript
type HeadcountBand = 'UNDER_5' | 'FIVE_OR_MORE' | 'UNKNOWN';

type StoreHeadcountDeclaration = {
  id: string;
  storeId: string;
  band: HeadcountBand;
  effectiveFrom: Date;
  declaredBy: string;
  note: string | null;
};
```

## 8. REST API

기본 경로: `/api/v1`. 모든 쓰기 요청은 권한 검사, Zod 입력 검증, 감사 로그를 거친다.

### 매장·직원

| Method | Endpoint | 비고 |
|---|---|---|
| POST | `/stores` | |
| GET | `/stores` | 내 소속 매장 |
| PATCH | `/stores/:storeId` | |
| POST | `/stores/:storeId/headcount-declarations` | 신규 |
| GET | `/stores/:storeId/headcount-declarations` | 신규 |
| POST | `/stores/:storeId/invitations` | |
| POST | `/invitations/:token/accept` | 1회용 |
| GET | `/stores/:storeId/members` | |
| PATCH | `/stores/:storeId/members/:memberId` | 역할·권한·비활성화 |
| POST | `/stores/:storeId/qr/rotate` | 기존 토큰 즉시 폐기 |

### 출퇴근

| Method | Endpoint | 비고 |
|---|---|---|
| POST | `/attendance/punch` | **변경**: clock-in/out 통합. body `{ qrToken, location? }`, 헤더 `Idempotency-Key` 필수. 응답 `{ action: 'CLOCK_IN' \| 'CLOCK_OUT', attendance }` |
| GET | `/attendance/punch-preview?qrToken=` | 신규: 스캔 직후 "출근할까요/퇴근할까요" 판별 |
| GET | `/attendance/current` | |
| GET | `/attendance/me` | |
| GET | `/stores/:storeId/attendances` | |
| PATCH | `/attendances/:id` | 신규: 관리자 직접 수정 (사유 필수) |
| POST | `/attendances/:id/correction-requests` | type: `TIME` \| `BREAK_WAIVED` \| `MISSING_CLOCK_OUT` |
| POST | `/correction-requests/:id/approve` | |
| POST | `/correction-requests/:id/reject` | |

`punch` 응답은 같은 `Idempotency-Key` 로 24시간 동안 동일 결과를 반환한다. 네트워크 실패 후 재시도로 "기록 성공 여부 확인" 요구를 충족한다.

### 근로조건 및 검토

| Method | Endpoint | 설명 |
|---|---|---|
| POST | `/stores/:storeId/members/:id/employment-terms` | 새 버전 생성, 응답에 생성된 검토 항목 포함 |
| GET | `/stores/:storeId/members/:id/employment-terms` | 버전 이력 |
| GET | `/stores/:storeId/labor-reviews?status=OPEN` | 신규: 매장 전체 검토 목록 |
| GET | `/stores/:storeId/members/:id/labor-reviews` | |
| PATCH | `/labor-reviews/:id` | `ACKNOWLEDGED` 등 상태 변경 |
| GET | `/stores/:storeId/payroll/preview?from=&to=` | 미해결 항목 요약 포함 |
| GET | `/stores/:storeId/payroll/export?from=&to=` | CSV |

## 9. 보안 및 비기능 요구사항

- 서버 기준 출퇴근 시간 기록
- 직원 인증 및 활성 매장 소속 확인
- QR 토큰은 해시 저장, 폐기·재발급 즉시 반영
- `Idempotency-Key` 기반 중복 요청 방지
- 직원당 진행 중 근무 세션 1개 (DB 제약)
- 매장 간 데이터 격리 (모든 쿼리 `storeId` 스코프, 테스트로 검증)
- 감사 로그: 근로조건·근태·검토 상태 변경 전부
- 개인정보 최소 수집: 이름, 휴대폰. 주민번호·계좌는 MVP에서 수집하지 않음
- **위치정보**: 출근 시점 1회만, 브라우저 권한 동의 시에만. 차단 용도로 쓰지 않고 표시만 한다. 수집 목적을 가입 시 고지
- **보관·파기**: 근로계약·임금 관련 기록은 퇴사(비활성화) 후 3년 보관(근기법 §42) 후 파기. 위치 기록은 1년 후 파기
- HTTPS
- 정적 QR은 사진으로 원격 공유될 수 있다. 위치 배지·QR 재발급·키오스크 동적 QR(P1)로 완화하며, 실제 매장 체류를 증명하지 않는다는 점을 관리자에게 고지

## 10. 가격 정책

**기본 구독료: 월 9,900원 / 매장 (부가세 별도)**

- 활성 직원 5명 포함, 추가 1명당 월 1,000원
- **활성 직원 정의**: 해당 청구 월에 출근 기록이 1건 이상인 직원
- 비활성(퇴사) 직원은 과금하지 않으며 과거 기록은 유지
- 다점포는 매장별 과금
- 파일럿 매장은 무료 운영 후 유료 전환 의향 검증

## 11. 초기 출시 및 검증

### Phase 1 — 문제 검증

- 매장 사장님 10명 인터뷰
- 핵심 질문: 월말 정산에 걸리는 시간, 수당·최저임금 관련 걱정·분쟁 경험, 현재 쓰는 도구와 비용
- 구독료 지불 의향 (9,900원 기준 반응)

### Phase 2 — MVP 개발

- 인증, 매장, 사업장 규모 신고
- 직원 초대, 근로조건(요일별 스케줄)
- 최저임금·휴게·주휴 안내 바텀시트
- QR 출퇴근 (자동 토글, 멱등)
- 근무시간 집계, 휴게 자동 차감 + "휴게 못 함"
- 퇴근 누락 처리, 수정 요청
- 예상 기본급, 대시보드, CSV

**선행 작업**: 시간 분할(자정·기간 경계·시간대) 순수 함수와 테스트를 계산 로직보다 먼저 작성한다.

### Phase 3 — 파일럿

- 지인 매장 2~3곳, 4주 운영
- 성공 지표
  - 출퇴근 기록 성공률 ≥ 98% (퇴근 누락 제외)
  - 퇴근 누락률 ≤ 5%
  - 사장님 수기 정산 대비 근무시간 오차 0분, 기본급 오차 0원
  - 바텀시트 문구 이해도 인터뷰 (사장님이 의미를 설명할 수 있는가)
  - 월말 정산 소요 시간 (전후 비교)

### Phase 4 — 유료화

- 결제, 법정수당 계산 고도화, 임금명세서
- 셀프 온보딩, 키오스크 모드
- 고객 추천 및 확장 실험

## 12. 미확정 사항

### v0.4에서 결정

| v0.3 항목 | 결정 |
|---|---|
| 직원 인증 방식 | 카카오 로그인 + 휴대폰 OTP |
| 스마트폰 미사용 직원 | P1 매장 태블릿 키오스크 + 개인 PIN |
| 휴게시간 입력 UX | 소정 휴게 자동 차감 + "휴게 못 함" 신고 (§6.2) |
| 근무 중 시급 변경 | 출근 시각 유효 버전 적용 |
| 월말 경계 야간근무 | 매장 시간대 기준 경계 분할 후 각 기간 귀속 |
| 사업장 규모 입력 | 구간 신고 + 이력, P1 참고 추정 |
| 직원 수 과금 | 해당 월 출근 기록 기준 |
| 개인정보 보관 | 퇴사 후 3년, 위치 1년 |
| 부가세 | 별도 |

### 남은 항목

1. 법정수당 계산 규칙 세부 (노무사 검증 필요): 주휴 개근 판단 시 지각·조퇴 처리, 단시간근로자 1일·1주 초과 중복 계산
2. 퇴근 누락 자동 전환 기준 시간 (소정 종료 + 4시간 가정)
3. 위치 "매장 밖" 판정 반경 (200m 가정, 정확도 낮은 경우 처리)
4. 원 미만 올림 정책에 대한 사장님 수용성
5. 공인노무사법 관련 서비스 문구·면책 범위 법률 검토
6. 결제 PG 선정

## 13. MVP 범위 원칙

최초 출시의 핵심 가치는 다음과 같다.

1. QR 스티커 하나로 출퇴근 기록
2. 사장님의 실시간 근무 현황 확인
3. 직원별 근무시간 자동 집계와 월말 정산
4. 예상 기본급 계산
5. 최저임금·휴게·주휴 등 놓치기 쉬운 의무를 필요한 순간에 안내

**복잡한 인사관리 시스템이 아니라, 작은 가게에서 가장 쉽게 시작할 수 있는 직원 관리 서비스로 만든다.**
