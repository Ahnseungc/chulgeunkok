# 관리자 대시보드 — 기능 스펙

| 항목 | 값 |
| --- | --- |
| 상태 | **Draft** (2026-11-03) |
| PRD | [§4 ADMIN-01](../../prd-v0.4.md) |
| 인덱스 | [../README.md](../README.md) |

---

## 1. 개요

사장님이 앱을 열었을 때 **지금 누가 일하는지**와 **처리할 일**을 한 화면에서 본다. 처리할 일은 정산을 막는 순서대로 보여 준다.

## 2. 범위 / 비목표

| 포함 | 제외 |
| --- | --- |
| 지금 근무 중, 오늘 출근 현황 | 실시간 푸시 (30초 폴링) |
| 처리할 일 카드 | 인건비 분석 차트 (P2) |
| 이번 기간 예상 인건비 (`PAYROLL_READ`) | 다점포 통합 보기 (P2) |

## 3. 화면 `/owner/[storeId]`

위에서 아래 순서.

| # | 영역 | 내용 | 탭 동작 |
| --- | --- | --- | --- |
| 1 | 헤더 | 매장명 (여러 매장이면 전환 드롭다운), 설정 | |
| 2 | 지금 근무 중 | 인원 수 + 이름·출근 시각·경과 시간. "매장 밖" 배지 | 근태 상세 |
| 3 | 오늘 | 출근 n명 / 오늘 소정 근무자 m명. **아직 출근 전**: 소정 시작 시각이 지났는데 출근 기록이 없는 직원 | 직원 상세 |
| 4 | 처리할 일 | 아래 §4 표 순서, 0건인 카드는 숨김 | 각 목록 |
| 5 | 이번 정산 기간 | 기간, 총 인정 시간, 예상 인건비 = 기본급 + 주휴·가산·유급휴일(`payroll` §3.6·§3.7) (`PAYROLL_READ` 없으면 시간만) | 정산 화면 |
| 6 | 메뉴 | 직원 · 근태 기록 · 정산 · 매장 설정 (아직 없는 화면은 "준비 중") | 각 화면 |

전부 0건이고 근무자도 없으면 2~4 대신 빈 상태: "오늘도 준비 완료예요" + QR 출력 버튼.

## 4. 처리할 일

| 순서 | 카드 | 조건 | 대상 권한 |
| --- | --- | --- | --- |
| 1 | 근로조건 필요 | ACTIVE 직원 중 현재 유효한 근로조건이 없음 (출근 불가) | Owner, `TERMS_EDIT` |
| 2 | 퇴근 누락 | `MISSING_CLOCK_OUT` (현재·직전 정산 기간) | 관리자 전체 |
| 3 | 수정 요청 | `CorrectionRequest.status = PENDING` | 관리자 전체 |
| 4 | 검토 필요 | `LaborReview.status IN (OPEN, NEEDS_INFORMATION)`, 표시 방식이 바텀시트인 것 (`labor` §6.2) | Owner, `PAYROLL_READ`, `TERMS_EDIT` |
| 5 | 대기 중 초대 | 만료 전, 미수락 | Owner, Manager |
| 6 | 명세서 확인 | 매장의 `Payslip.status = DRAFT` (초안·정정본). `/owner/[storeId]/payslips` 로 이동 (`payslip` §5.1) | Owner |

- 진입 시 아직 안 본 검토 항목이 있으면 바텀시트 1회 (`labor` §6.2).
- 퇴근 누락·수정 요청 카드는 근태 화면이 생기기 전까지 건수만 보여 준다 (링크 없음).
- "확인할 안내"는 바텀시트 대상(`SHEET`)만 센다. 5인 미만 배지·목록 전용 안내는 처리할 일이 아니다.

## 5. API

`GET /stores/:storeId/dashboard`

```ts
interface Dashboard {
  serverNow: string;
  working: {
    attendanceId: string; memberId: string; name: string;
    clockInAt: string; outsideArea: boolean | null;
  }[];
  today: {
    clockedInCount: number;
    scheduledCount: number;
    notYetClockedIn: { memberId: string; name: string; scheduledStartAt: string }[];
  };
  todo: {
    termsMissing: number;
    missingClockOut: number;
    pendingCorrections: number;
    laborReviews: number | null;   // 권한 없으면 null
    pendingInvitations: number;
    payslipDrafts: number | null;  // Owner가 아니면 null
  };
  currentPeriod: {
    start: string; end: string;
    recognizedSeconds: number;
    basePayEstimate: number | null; // PAYROLL_READ 없으면 null
    allowanceEstimate: number | null; // 예상 주휴·가산 합. PAYROLL_READ 없으면 null
  };
}
```

- 권한: 매장 Owner·Manager.
- 클라이언트: TanStack Query `refetchInterval: 30_000`, `refetchOnWindowFocus: true`. 경과 시간은 `serverNow` 기준으로 클라이언트에서 1분마다 갱신.
- 성능: 단일 요청에서 집계. 쿼리는 `storeId` 인덱스 범위 안. 목표 p95 300ms (직원 30명 기준).
- `currentPeriod` 집계는 `payroll` §3 함수를 재사용한다 (별도 계산 금지).

## 6. 수용 기준

- [ ] 직원이 출근하면 30초 안에 "지금 근무 중"에 나타난다.
- [ ] 소정 18:00 직원이 18:10까지 출근 안 하면 "아직 출근 전"에 보인다. 스케줄 없는 요일엔 보이지 않는다.
- [ ] Manager(권한 없음)에게 `laborReviews`, `basePayEstimate`, `allowanceEstimate`가 `null`이고 해당 카드가 숨겨진다.
- [ ] 처리할 일이 모두 0이면 카드 영역이 사라진다.
- [ ] 대시보드 예상 기본급·주휴·가산 합이 정산 화면 같은 기간 합계와 같다.
