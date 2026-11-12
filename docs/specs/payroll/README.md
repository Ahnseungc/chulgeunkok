# 근무시간 계산·예상 기본급·CSV — 기능 스펙

| 항목 | 값 |
| --- | --- |
| 상태 | **Draft** (2026-11-03) |
| PRD | [§3.4, §4 TIME-02·PAY-01·ADMIN-02, §6](../../prd-v0.4.md) |
| 인덱스 | [../README.md](../README.md) |

---

## 1. 개요

1. 정산 기간은 매장의 `payPeriodStartDay`로 정한다.
2. 근태 1건 → 시간대 경계로 **구간 분할** → 휴게 차감 → 인정 초.
3. 예상 기본급 = Σ(인정 초 × 근태의 적용 시급) ÷ 3600, **직원·기간 합계에서 1회 원 미만 올림**.
4. 예상 주휴수당·가산수당은 §3.6. 기본급과 따로 계산하고 따로 보여 준다.
5. 계산 함수는 DB를 모르는 **순수 함수**다. 테스트를 먼저 쓴다.

## 2. 범위 / 비목표

| 포함 | 제외 |
| --- | --- |
| 정산 기간 계산 | 공휴일 목록 관리 화면 (코드 상수, §3.7) |
| 인정 근무시간, 예상 기본급 | 세금·4대보험 공제 |
| 예상 주휴수당, 연장·야간·휴일 가산수당 (§3.6), 유급휴일수당 (§3.7) | |
| 미해결 항목 요약 | 정산 확정·잠금 (P1. MVP는 수정 기한 35일로 대체) |
| CSV 내보내기 | 임금명세서 → [payslip](../payslip/README.md) |

## 3. 계산

### 3.1 정산 기간

```ts
/** 날짜가 속한 정산 기간 [start, end) — 매장 시간대 날짜 */
function getPayPeriod(date: LocalDate, startDay: number): { start: LocalDate; end: LocalDate };
```

- `startDay = 1` → 11/1 ~ 12/1(미포함). `startDay = 21` → 10/21 ~ 11/21.
- `startDay`는 1~28 (월말 문제 회피).
- 시작일 변경은 `store` §4 — 기준일 이전은 이전 값으로 계산.

### 3.2 근태 1건 → 인정 구간

```ts
interface Segment {
  attendanceId: string;
  localDate: LocalDate;   // 구간이 속한 날짜 (매장 시간대)
  startAt: Date;
  endAt: Date;
  workedSeconds: number;
  breakSeconds: number;
  recognizedSeconds: number; // worked − break
  hourlyWage: number;
}

function toSegments(input: {
  attendance: { id; clockInAt; clockOutAt; breakWaived; breaks: { startAt; endAt? }[] }; // breaks: 직원이 남긴 휴게 (attendance §3.6)
  terms: { hourlyWage; schedules };
  timezone: string;
}): Segment[];
```

1. **분할**: `[clockInAt, clockOutAt)`을 매장 시간대 자정마다 자른다. (정산 기간 경계는 항상 자정이므로 자정 분할로 충분)
2. **남긴 휴게가 있으면** (기록된 휴게가 1개 이상): 소정 휴게 차감(아래 3·4)을 하지 않는다. **기록된 휴게** = 길이 1분 이상(`MIN_RECORDED_BREAK_MS = 60_000`)이거나 아직 열린 휴게. 1분 미만(잘못 누름·길이 0으로 접힌 휴게)은 없는 것으로 보고 차감에도 쓰지 않는다 — 한 규칙(`recorded-breaks.ts`)을 정산·야간·검토·휴게 못 함 거절·화면이 같이 쓴다. 각 기록된 휴게 `[startAt, endAt ?? clockOutAt)`가 각 구간과 겹친 초를 그 구간의 `breakSeconds`로 뺀다. 근무 밖 부분은 버린다. `breakWaived`·4시간 미만·소정 없음 플래그는 보지 않는다 (`BREAK_NOT_SCHEDULED` 없음).
3. **남긴 휴게가 없으면 휴게 차감량** `B`:
   - `breakWaived` → 0
   - 전체 근무 < 4시간 → 0
   - 출근 날짜 요일의 소정 스케줄이 있으면 `min(breakMinutes × 60, 전체 근무초)`
   - 소정 스케줄이 없으면 0 + 플래그 `BREAK_NOT_SCHEDULED` (§4)
4. **배분**: `B`를 첫 구간부터 채운다. 첫 구간보다 길면 남은 만큼 다음 구간에서 뺀다.
5. `hourlyWage`는 근태의 `termsId` 버전 값. 구간마다 같다 (PRD §6.1 "한 근무는 한 시급").

> ponytail: 남긴 휴게가 없으면 휴게를 언제 썼는지 모르므로 첫 구간 배분으로 단순화한다. 남긴 휴게는 겹침 기준으로 뺀다.

### 3.3 기간 합계

```ts
function summarizeMember(segments: Segment[], period): {
  recognizedSeconds: number;
  basePayEstimate: number;     // 원, 정수
  byWage: { hourlyWage: number; recognizedSeconds: number }[];
};

basePayEstimate = Math.ceil(
  sum(segments.map((s) => s.recognizedSeconds * s.hourlyWage)) / 3600,
);
```

- `period.start <= segment.localDate < period.end`인 구간만.
- 정수 곱(초 × 원)은 `Number.MAX_SAFE_INTEGER` 안이다 (한 달 2.6M초 × 100만원 = 2.6e12).

### 3.4 표시

- 화면 시간은 `recognizedSeconds`를 **분 내림**해 "4시간 33분". 금액은 §3.3 값.
- 표시 분 × 시급 ÷ 60과 금액이 1원 단위로 다를 수 있다. 화면 하단: "초 단위로 계산해 원 단위로 올렸어요."

### 3.5 예시 (테스트 픽스처)

| # | 입력 (Asia/Seoul) | 기대 |
| --- | --- | --- |
| 1 | 월 18:00–23:00, 소정 휴게 30분, 시급 10,320 | 인정 4h30m, 46,440원 |
| 2 | 월 18:00–02:00(화), 휴게 60분 | 월 구간 6h−1h=5h, 화 구간 2h → 합 7h |
| 3 | 10/31 20:00–11/1 02:00, `startDay=1`, 휴게 30분 | 10월 기간 4h−30m=3h30m, 11월 기간 2h |
| 4 | 근무 3h59m, 소정 휴게 30분 | 차감 0, 인정 3h59m |
| 5 | `breakWaived = true`, 5h 근무 | 차감 0, 인정 5h |
| 6 | 근무 4h 0m 31s, 휴게 30분, 시급 10,320 | 12,631초 × 10,320 ÷ 3600 = 36,208.87 → **36,209원** (올림) |
| 7 | 23:20–04:00, 휴게 60분 | 첫 구간(40분) 0, 둘째 구간 4h − 20m = 3h40m, 합 3h40m |
| 8 | 소정 스케줄 없는 토요일 6h 근무 | 차감 0, `BREAK_NOT_SCHEDULED` 플래그 |
| 9 | 월 18:00–23:00, 소정 휴게 30분, 남긴 휴게 20:00–20:20 | 차감 20분, 인정 4h40m |
| 10 | 월 20:00–화 04:00, 남긴 휴게 23:40–00:30 | 월 구간 4h−20m=3h40m, 화 구간 4h−30m=3h30m |
| 11 | 18:00–23:00, 남긴 휴게 19:00–19:10, 21:00–21:15 | 차감 25분, 인정 4h35m |
| 12 | 남긴 휴게 20분 + `breakWaived = true` / 3h 근무에 10분 / 소정 없는 토요일 6h에 30분 | 각각 남긴 휴게만 차감, 플래그 없음 |
| 13 | 18:00–22:00(관리자가 퇴근을 당김), 남긴 휴게 21:50–22:30 | 근무 안 10분만 차감, 인정 3h50m |
| 14 | 월 09:00–18:00, 소정 휴게 60분, 남긴 휴게 12:00:00–12:00:30 (30초) | 기록 아님 → 소정 60분 차감, 인정 8h |
| 15 | 월 09:00–18:00, 소정 휴게 60분, 길이 0으로 접힌 휴게 18:00–18:00 | 기록 아님 → 소정 60분 차감, 인정 8h |
| 16 | 월 09:00–18:00, 소정 휴게 60분, 남긴 휴게 30초 + 1분 | 1분만 차감, 인정 8h59m |

### 3.6 예상 주휴수당·가산수당 (PRD §6.3)

`model/allowances.ts` `estimateAllowances`. 근태·근로조건·규모 신고 조회는 `server/allowance-service.ts` `loadPeriodWithAllowances` 하나로 정산 미리보기·직원 본인(`/me`)·대시보드가 같이 쓴다. 직원·기간마다 항목별 합계에서 1회 원 미만 올림. 원 미만 올림은 결정됨(인덱스 Q5). 법정수당 기준값은 노무사 검증 전 설계 가정이고(Q6, MVP 제외) 모두 "예상"이다.

**주 단위 항목은 그 주 일요일이 속한 기간에 넣는다.** 끝난 주(일요일 < 오늘)만 센다. 그래서 기간 첫 주 월요일부터 근태를 읽는다.

| 항목 | 대상 | 계산 |
| --- | --- | --- |
| 주휴수당 | 전 사업장 | 주 소정 15시간 이상 + 그 주 소정 근무일 모두 출근이면 `min(주 소정분, 2400) × 시급 ÷ 300` (= min(주 소정 ÷ 40h, 1) × 8h × 시급) |
| 연장 가산 50% | 5인 이상 신고일 | 통상: 하루 8시간 초과 + 주 40시간 초과(일 초과분 제외). 단시간: 그날 소정근로 초과 |
| 야간 가산 50% | 5인 이상 신고일 | 22:00–06:00 겹침. 날짜마다 그날 인정 시간을 넘지 않게 자른다 |
| 휴일 가산 | 5인 이상 신고일 | 주휴일(`weeklyHolidayWeekday`) 인정 시간. 8시간까지 50%, 넘으면 100%. 연장으로 겹쳐 세지 않는다 |

- 개근: 날짜마다 그날 유효한 근로조건의 소정 요일에 출근 기록(무효 제외, 근무 중·퇴근 누락 포함)이 있어야 한다. 근로조건 시작 전 날짜는 따지지 않는다.
- 주 소정·시급은 그 주 일요일에 유효한 근로조건.
- 하루에 시급이 둘이면 그날 마지막 근무의 시급으로 가산한다.
- 규모 신고는 날짜별(`store` §6.2). 주 40시간 초과는 그 주 일요일 기준.

> ponytail: 주마다 다른 근로조건(`scheduleVaries`)은 소정 요일을 모르므로 그 주에 한 번이라도 출근하면 개근으로 보고, 단시간이면 일 단위 연장은 세지 않는다. 근무표(P2) 도입 시 바꾼다.
- 야간 초 = 구간의 22:00–06:00 겹침 − 기록된 휴게(§3.2, attendance §3.6)와 겹친 야간. 예: 월 18:00–24:00, 휴게 22:00–23:00 → 야간 1h.

> ponytail: 남긴 휴게가 없으면 휴게를 언제 썼는지 모르므로 야간 시간을 인정 시간으로만 자른다.

| # | 입력 (월~금 09–18 휴게 60분, 주휴일 일요일, 시급 10,000) | 기대 |
| --- | --- | --- |
| 1 | 월~금 소정대로 근무 | 주휴 80,000원 |
| 2 | 화~금만 근무 | 주휴 0원 |
| 3 | 월·수·금 5시간(주 15시간) 개근 | 주휴 30,000원 |
| 4 | 5인 이상, 월 09–20 | 연장 2h, 10,000원 |
| 5 | 5인 이상, 금 18–토 02 | 야간 4h, 20,000원 |
| 6 | 5인 이상, 일 09–20 (휴게 차감 없음) | 휴일 11h, 70,000원 (8h×50% + 3h×100%) |
| 7 | 5인 이상, 월~금 8h + 토 8h | 주 40시간 초과 8h, 40,000원 + 주휴 80,000원 |

### 3.7 공휴일·노동절 유급휴일

`model/public-holidays.ts`. 관공서 공휴일(대체·임시 포함)은 한국천문연구원 월력요항 2026·2027을 상수로 둔다. 매년 월력요항 고시 뒤 다음 해를 추가한다 — 목록에 없는 해는 공휴일이 없는 것으로 계산된다.

| 날 | 유급휴일 대상 |
| --- | --- |
| 관공서 공휴일 | 5인 이상 신고일 (근기법 §55②) |
| 노동절 5/1 | 전 사업장 (노동절 제정에 관한 법률) |

- **유급휴일수당**: 기간 안 지난 유급휴일이 그날 유효한 근로조건의 소정 요일이면 `그날 소정근로분 × 시급 ÷ 60`. 출근 여부와 상관없다 (근무했으면 임금·가산은 따로). 소정 요일이 아니면(주휴일 포함) 0.
- **휴일근로**: 유급휴일 근무는 주휴일 근무와 같이 §3.6 휴일 가산(8시간까지 50%, 넘으면 100%, 5인 이상만)으로 세고 연장·주 40시간에서 뺀다.
- **주휴 개근**: 유급휴일은 소정 근무일이어도 쉬어도 결근이 아니다.

> ponytail: 근로조건이 주마다 다르면(`scheduleVaries`) 그날 소정을 모르므로 유급휴일수당을 세지 않는다.

| # | 입력 (§3.6 근로조건) | 기대 |
| --- | --- | --- |
| 1 | 5인 이상, 2026-10 기간, 10/5·10/9 쉬고 10/6~8 근무 | 유급휴일 2일 160,000원, 주휴 80,000원 |
| 2 | 1과 같고 5인 미만 | 유급휴일 0원, 주휴 0원 (결근) |
| 3 | 5인 미만, 2026-05 기간 | 노동절 1일 80,000원 |
| 4 | 5인 이상, 10/9 09–20 | 휴일 10h, 60,000원, 연장 0 |

## 4. 미리보기 응답

`GET /stores/:storeId/payroll/preview?periodStart=YYYY-MM-DD` (생략 시 현재 기간)

```ts
interface PayrollPreview {
  period: { start: string; end: string };
  headcountBand: 'UNDER_5' | 'FIVE_OR_MORE' | 'UNKNOWN'; // 기간 마지막 날(오늘까지) 기준. 안내 문구용
  totals: { recognizedSeconds: number; basePayEstimate: number; allowanceEstimate: number; memberCount: number };
  members: {
    memberId: string;
    name: string;
    status: 'ACTIVE' | 'INACTIVE';
    recognizedSeconds: number;
    basePayEstimate: number;
    byWage: { hourlyWage: number; recognizedSeconds: number }[];
    allowances: {                     // §3.6
      weeklyHolidayPay: number; weeklyHolidayWeeks: number;
      overtimePremium: number; overtimeSeconds: number;
      nightPremium: number; nightSeconds: number;
      holidayPremium: number; holidaySeconds: number;
      paidHolidayPay: number; paidHolidayDays: number; // §3.7
      total: number;
    };
    attendanceCount: number;
    flags: {
      openCount: number;              // 근무 중 — 제외됨
      missingClockOutCount: number;   // 제외됨
      pendingCorrectionCount: number;
      breakNotScheduledCount: number;
      openLaborReviewCount: number;
    };
  }[];
  unresolved: { missingClockOut: number; pendingCorrections: number; openLaborReviews: number };
}
```

- 대상 직원: 기간 안에 구간이 있거나 기간 중 ACTIVE였던 직원.
- `OPEN`, `MISSING_CLOCK_OUT`, `VOID` 근태는 합계에서 빼고 `flags`에만 센다.
- 직원 본인용 `GET /attendance/me/payroll?storeId=&periodStart=` 는 같은 계산(기본급 + §3.6)을 본인 1명으로. 응답 `allowances`는 미리보기 `members[].allowances`와 같은 모양.

## 5. CSV

`GET /stores/:storeId/payroll/export?periodStart=` → `text/csv; charset=utf-8`, **UTF-8 BOM** (엑셀 한글).

파일명: `출근콕_<매장명>_<YYYYMMDD>-<YYYYMMDD>.csv`

### 5.1 시트: 직원별 요약 (기본)

| 열 | 예 |
| --- | --- |
| 이름 | 김알바 |
| 휴대폰 뒤 4자리 | 1234 |
| 상태 | 재직 / 퇴사 |
| 근무 일수 | 12 |
| 인정 근무시간(분) | 2730 |
| 인정 근무시간 | 45:30 |
| 적용 시급 | 10320 (여러 개면 `10320/11000`) |
| 예상 기본급(원) | 469560 |
| 예상 주휴수당(원) | 80000 |
| 예상 연장 가산(원) | 0 |
| 예상 야간 가산(원) | 0 |
| 예상 휴일 가산(원) | 0 |
| 예상 유급휴일수당(원) | 0 |
| 예상 합계(원) | 549560 |
| 퇴근 누락 건수 | 0 |
| 대기 중 수정 요청 | 0 |
| 검토 필요 항목 | 2 |

### 5.2 `?detail=1`: 근무별 상세

이름, 날짜, 출근, 퇴근, 근무(분), 휴게 차감(분), 인정(분), 시급, 상태, 수정 여부, 매장 밖 여부.

- 휴대폰 전체 번호는 넣지 않는다 (개인정보 최소화).
- 셀 값이 `= + - @`로 시작하면 앞에 `'` 를 붙인다 (CSV 인젝션 방지).
- 미해결 항목이 있으면 화면에서 "퇴근 누락 3건이 빠져 있어요. 그래도 내보낼까요?" 확인.

## 6. 화면 `/owner/[storeId]/payroll`

1. 기간 선택 (이전·다음 화살표)
2. 미해결 배너 → 탭 시 해당 목록으로 이동
3. 합계 카드: 총 인정 시간, 예상 합계(기본급 + 주휴·가산·유급휴일), 항목별 내역
4. 직원 목록: 이름, 시간, 예상 합계, 주휴·가산이 있으면 항목별 금액, 플래그 배지
5. 직원 탭 → 근무별 상세 (§5.2와 같은 열)
6. "CSV 내보내기" (요약 / 상세)
7. 하단 고지: "예상 금액이에요. 공제는 빠져 있고, 주휴·유급휴일수당은 지난 날만 넣었어요." + 5인 미만이면 "5인 미만 사업장은 연장·야간·휴일 가산수당을 넣지 않았어요.", 미신고면 "사업장 규모를 알려주시면 가산수당도 계산해 드려요."

## 7. 권한

| | Owner | `PAYROLL_READ` | Manager | 본인 |
| --- | --- | --- | --- | --- |
| 미리보기 | ✅ | ✅ | ❌ | 본인만 |
| CSV | ✅ | ✅ | ❌ | ❌ |

- `PAYROLL_READ` Manager는 휴대폰 인증 뒤에만 (`PHONE_VERIFICATION_REQUIRED`, auth §4.2).

## 8. 에러 코드

| code | HTTP | 메시지 |
| --- | --- | --- |
| `PAY_PERIOD_INVALID` | 400 | 정산 기간 시작일이 맞지 않아요. (`periodStart`가 기간 시작일이 아님) |
| `PAY_PERIOD_IN_FUTURE` | 400 | 아직 시작하지 않은 기간이에요. |

## 9. 수용 기준

- [ ] §3.5 픽스처 8건이 순수 함수 테스트로 통과한다.
- [ ] 시급이 기간 중 10,320 → 11,000으로 바뀌면 `byWage` 2줄, 합계는 각 근태의 시급으로 계산된다.
- [ ] 같은 근무가 두 기간에 걸치면 두 기간의 합이 근무 전체 인정시간과 같다.
- [ ] CSV를 엑셀에서 열면 한글이 깨지지 않는다.
- [ ] 이름이 `=HYPERLINK(...)` 인 직원도 CSV에서 수식으로 실행되지 않는다.
- [ ] Manager(`PAYROLL_READ` 없음)는 미리보기·CSV 모두 `FORBIDDEN`.
- [ ] §3.6 픽스처 7건이 순수 함수 테스트로 통과한다.
- [ ] 5인 미만·미신고 기간은 가산수당이 0원이고 주휴수당은 계산된다.
- [ ] §3.7 픽스처 4건이 순수 함수 테스트로 통과한다.
