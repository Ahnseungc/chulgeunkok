# 출퇴근·근태 수정 — 기능 스펙

| 항목 | 값 |
| --- | --- |
| 상태 | **Draft** (2026-11-03) |
| PRD | [§3.3, §4 TIME-01·03·04, §9](../../prd-v0.4.md) |
| 인덱스 | [../README.md](../README.md) |

---

## 1. 개요

1. 직원이 QR을 찍으면 `/p/<token>`이 열린다. 서버가 출근인지 퇴근인지 판별해 확인 버튼 하나를 보여 준다.
2. 버튼을 누르면 `POST /attendance/punch`. 서버 수신 시각으로 기록한다. `Idempotency-Key`로 재시도해도 한 번만 기록된다.
3. 퇴근을 잊으면 일정 시간 뒤 `MISSING_CLOCK_OUT`으로 바뀌고, 직원이 수정 요청으로 퇴근 시각을 넣는다.
4. 모든 근태 변경은 `AttendanceRevision`에 남는다.
5. 근무 중에 `/me` 근무 카드에서 휴게 시작·끝을 직접 남길 수 있다 (§3.6). 남긴 휴게가 있으면 정산은 소정 휴게 대신 그 시간을 뺀다.

## 2. 범위 / 비목표

| 포함 | 제외 |
| --- | --- |
| QR punch, 자동 토글, 멱등 | 근무 중(`OPEN`) 휴게의 관리자 편집 |
| 출근 위치 기록·"매장 밖" 배지 | 위치로 출근 차단 |
| 퇴근 누락 자동 전환 | 퇴근 누락 푸시 알림 (P1) |
| 수정 요청 (시각, 휴게 못 함, 퇴근 누락) | 교대 근무 변경 요청 (P2) |
| 관리자 직접 수정·무효 처리, 빠진 근무 직접 추가, 끝난 근무의 휴게 고치기 (§7.4·§7.5·§7.6) | |
| 실제 휴게 시작·종료 기록 (§3.6, P1 → 파일럿 포함) | 휴게 위치 검사·QR 재스캔 |

## 3. Punch

### 3.1 QR 랜딩 `/p/[qrToken]`

| 순서 | 조건 | 화면 |
| --- | --- | --- |
| 1 | 토큰 해시 없음 | "QR을 확인할 수 없어요" |
| 2 | 폐기된 토큰 | "새 QR로 바뀌었어요. 매장에 붙은 최신 QR을 찍어 주세요." |
| 3 | 등록되지 않은 기기 | "이 휴대폰은 아직 등록되지 않았어요. 사장님께 초대 링크를 요청해 주세요." (`auth` §3.5 인앱 브라우저 안내 포함) |
| 4 | 이 매장 ACTIVE Membership 없음 | "이 매장 직원이 아니에요. 사장님께 초대를 요청해 주세요." |
| 5 | 근로조건 없음 (§3.3) | "근로조건이 아직 등록되지 않았어요. 사장님께 알려 주세요." |
| 6 | 정상 | 매장명, 현재 시각, **[출근하기]** 또는 **[퇴근하기]** (+ 출근 시각, 경과 시간) |

- 1·2·4·5는 `GET /attendance/punch-preview` 에러 코드로 판별한다.
- 위치 권한은 6번 화면에서 요청한다. 거부해도 punch 가능.
- 페이지 로드 때 `Idempotency-Key`(UUID v4)를 만든다. 버튼을 여러 번 눌러도 같은 키.

### 3.2 `GET /attendance/punch-preview?qrToken=`

```ts
interface PunchPreview {
  store: { id: string; name: string };
  nextAction: 'CLOCK_IN' | 'CLOCK_OUT';
  openAttendance: { id: string; clockInAt: string } | null;
  serverNow: string;
}
```

### 3.3 `POST /attendance/punch`

```ts
// Header: Idempotency-Key: <uuid>
const PunchBody = z.object({
  qrToken: z.string().length(43),
  expectedAction: z.enum(['CLOCK_IN', 'CLOCK_OUT']),
  location: z.object({
    latitude: z.number(),
    longitude: z.number(),
    accuracyM: z.number().int().nonnegative(),
  }).nullable(),
});

interface PunchResult {
  action: 'CLOCK_IN' | 'CLOCK_OUT';
  attendance: AttendanceDto;
}
```

**처리 순서 (트랜잭션)**

1. 멱등 확인: `(userId, key)` 행이 있으면 `requestHash` 비교 → 같으면 저장된 응답 반환, 다르면 `422 IDEMPOTENCY_KEY_REUSED`
2. QR 토큰 → 매장. 폐기 `410 QR_TOKEN_REVOKED`, 없음 `404 QR_TOKEN_INVALID`
3. Membership ACTIVE 확인 후 `SELECT … FOR UPDATE` (같은 직원 동시 punch 직렬화)
4. OPEN 근무 조회 → `nextAction` 결정
5. `nextAction != expectedAction` → `409 PUNCH_ACTION_MISMATCH` (다른 기기에서 먼저 찍은 경우). 화면은 미리보기를 다시 불러온다
6. **CLOCK_IN**: `now`에 유효한 근로조건 조회. 없으면 `409 TERMS_NOT_SET`. `Attendance(OPEN, termsId, clockInAt = now, 위치)` 생성
7. **CLOCK_OUT**: `now - clockInAt < 60초` → `409 PUNCH_TOO_SOON` "방금 출근했어요. 1분 뒤에 퇴근할 수 있어요." 아니면 `clockOutAt = now`, `status = CLOSED`
8. 응답을 `IdempotencyKey`에 저장 (24시간)
9. 커밋 후 CLOCK_OUT이면 근무 기록 검토 실행 (§6). 실패해도 punch 응답에는 영향 없음 — 일배치가 다시 잡는다

`requestHash = sha256(JSON.stringify({ qrToken, expectedAction }))`. 위치는 해시에서 뺀다 (재시도 시 좌표가 조금 달라도 같은 요청).

### 3.4 완료 화면

`assets/brand/출근콕-출근완료화면.png` 기준. "출근했어요 18:02" / "퇴근했어요 23:05 · 오늘 4시간 33분". 퇴근이면 **"휴게 못 했어요"** 링크 (§7.2).

### 3.5 네트워크 실패

- 응답을 못 받으면 같은 키로 3회 자동 재시도 (es-toolkit `delay` 1s, 2s, 4s).
- 그래도 실패하면 "기록됐는지 확인 중이에요" → `GET /attendance/current`로 상태 확인 후 결과 표시.

### 3.6 휴게 시작·끝 (2026-11-12)

근무 중(`OPEN`)인 직원이 `/me` 근무 카드의 **[휴게 시작]** / **[휴게 끝]** 으로 남긴다. QR을 다시 찍지 않고 위치도 받지 않는다. 시각은 서버 수신 시각.

```ts
// AttendanceBreak(id, attendanceId, startAt, endAt?, createdAt)
// 근무당 여러 번. 열린 휴게(endAt IS NULL)는 근무당 1개 — 부분 유니크 "AttendanceBreak_attendanceId_open_key"
// CHECK endAt IS NULL OR endAt >= startAt
const BreakBody = z.object({ storeId: z.string().min(1) });
interface BreakResult { attendanceId: string; break: { id: string; startAt: string; endAt: string | null } }
```

| 요청 | 처리 (트랜잭션, punch와 같은 Membership `FOR UPDATE`) |
| --- | --- |
| `POST /attendance/break/start` | ACTIVE 직원 아님 `403 NOT_STORE_MEMBER`. OPEN 근무 없음 `409 NOT_WORKING`. 이미 열린 휴게가 있으면 **그 휴게를 그대로** 돌려준다 (멱등). 없으면 `startAt = now`로 만든다 |
| `POST /attendance/break/end` | OPEN 근무 없음 `409 NOT_WORKING`. 열린 휴게 없음 `409 BREAK_NOT_STARTED`. 있으면 `endAt = now` |

**열린 휴게 자동 종료**

| 시점 | `endAt` |
| --- | --- |
| 퇴근 punch (§3.3-7) | 퇴근 시각 |
| 퇴근 누락 자동 전환 (§5.1) | 전환 시각. 나중에 퇴근 시각을 넣으면 정산은 근무 안 부분만 뺀다 |
| 근무 중 기록을 무효 처리 (§7.4) | 처리 시각 |

**근무 시각을 고칠 때** (관리자 직접 수정·수정 요청 승인, §7.3·§7.4): 결과에 퇴근 시각이 있으면 그 근무의 휴게를 모두 `[출근, 퇴근]` 안으로 자른다. 열린 휴게는 퇴근 시각으로 닫는다. 근무 밖으로 완전히 나간 휴게는 지우지 않고 가까운 경계(출근 또는 퇴근 시각)에서 길이 0으로 접는다 — 남긴 기록은 남겨 두고 차감은 0. 퇴근 누락 전환 때 전환 시각으로 닫힌 휴게도 퇴근 시각을 넣는 순간 퇴근 시각으로 당겨진다.

- 동시성: 휴게 시작·끝, punch, 퇴근 누락 전환, 근태 수정·승인·관리자 추가·휴게 고치기는 모두 같은 Membership `FOR UPDATE` 잠금 안에서 처리한다 (열린 휴게가 끝난 근무에 남지 않게). 수정·승인은 잠금을 잡은 뒤 근태를 다시 읽어 그 값으로 계산·이력(before)을 남긴다 (잠금 전에 들어온 퇴근·휴게를 지우지 않게).

- 화면: 휴게 중이면 카드에 "휴게 중 · 12분"(서버 시각 기준 1분마다 갱신)과 [휴게 끝], 아니면 [휴게 시작]. 성공하면 토스트("휴게를 시작했어요" / "휴게 20분을 남겼어요"), 실패하면 오류 토스트. 어느 쪽이든 카드를 다시 불러온다.
- 기록된 휴게: 길이 1분 이상이거나 아직 열린 휴게만 센다. 1분 미만(잘못 누름, 근무 시각을 고쳐 길이 0으로 접힌 휴게)은 아래 정산·화면·검토 판단에서 없는 것으로 본다 (`payroll` §3.2). 기록은 지우지 않는다.
- 정산: 기록된 휴게가 하나라도 있으면 소정 휴게 자동 차감 대신 남긴 휴게를 구간별로 겹친 만큼 뺀다. `breakWaived`는 무시한다 (`payroll` §3.2). 예상 야간 가산도 휴게와 겹친 야간을 뺀다 (`payroll` §3.6).
- 기록된 휴게가 있는 근무: 퇴근 완료 화면의 "휴게 못 했어요", 본인 기록의 휴게 못 함 신청, 관리자 수정 폼의 "휴게를 못 썼어요" 체크를 보여 주지 않는다. 서버도 `BREAK_WAIVED` 요청을 `409 BREAK_ALREADY_RECORDED`로 거절한다. punch 응답 `breakRecorded`로 판별한다.
- 검토: 남긴 휴게 합계가 법정 휴게보다 짧으면 그 근무에 `BREAK_SHORTAGE` (`labor` §5).
- 사장님 근태 상세에 기록된 휴게(시각·합계, 근무 안 부분으로 잘라서)를 보여 준다. 퇴근까지 끝난 근무(`CLOSED`)는 "휴게 고치기"로 통째로 바꿀 수 있다 (§7.6). 근무 중 휴게는 직원만 남긴다.

## 4. 출근 위치 (인덱스 Q4 결정됨)

- `location`이 있고 매장 좌표가 있으면 haversine 거리 계산.
- `clockInOutsideArea = distance > 200m && accuracyM <= 100`. 정확도가 100m를 넘으면 `null`(판정 불가).
- 관리자 근태 목록에 "매장 밖" 배지. 직원 화면에는 보이지 않는다.
- 위치는 출근 1회만. 퇴근 위치는 받지 않는다. 1년 뒤 일배치로 좌표 3개 필드를 `null`로 지운다.

## 5. 퇴근 누락 (인덱스 Q3 결정됨)

### 5.1 자동 전환 (10분 주기 배치)

OPEN 근무 중 `now > 기준시각`인 것을 `MISSING_CLOCK_OUT`으로 바꾼다.

| 경우 | 기준시각 |
| --- | --- |
| 출근 요일에 소정 스케줄 있음 | 소정 퇴근 시각 + 4시간 (출근이 소정 시작보다 늦어도 소정 퇴근 기준) |
| 소정 스케줄 없음, 또는 소정 퇴근 시각 뒤에 출근(추가 근무) | `clockInAt + 16시간` (출근하자마자 누락이 되지 않게) |
| 근로조건이 "주마다 달라요" | `clockInAt + 16시간` |

- 소정 퇴근 시각 = 출근 날짜(매장 시간대)의 `startMinute + workMinutes`.
- 전환은 `AttendanceRevision`에 `actorId = 'system'`, `reason = 'AUTO_MISSING_CLOCK_OUT'`. 직원이 그 사이 퇴근을 찍었으면 조건부 update가 0건이라 건너뛴다.
- 휴게 중이었으면 같은 트랜잭션에서 열린 휴게를 전환 시각으로 닫는다 (§3.6).
- 실행: `GET|POST /api/internal/jobs/missing-clock-out` (`Authorization: Bearer <CRON_SECRET>`), 10분마다.

### 5.2 이후 동작

- 같은 직원이 다시 QR을 찍으면 **새 출근**이다 (OPEN이 없으므로).
- 직원 `/me`와 관리자 대시보드에 "퇴근 기록이 없어요" 카드 → 수정 요청 / 관리자 직접 수정.
- 정산에서 제외 (`payroll` §4).

## 6. 퇴근 후 검토 실행

CLOCK_OUT 커밋 후, 그리고 근태 수정 승인 후 실행. 규칙은 `labor` §5.

1. 근무 구간을 매장 시간대로 분할 (`payroll` §3.1)
2. `NIGHT_WORK`: 22:00–06:00 겹침 분 > 0
3. `OVERTIME`: 그날 인정분, 그 주 누적 인정분 계산
4. upsert / 조건 해소 시 `RESOLVED`

## 7. 수정

### 7.1 수정 요청 (직원)

```ts
const CreateCorrectionBody = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('TIME'),
    proposedClockInAt: z.string().datetime().optional(),
    proposedClockOutAt: z.string().datetime().optional(),
    reason: z.string().trim().min(1).max(200),
  }),
  z.object({ type: z.literal('BREAK_WAIVED'), reason: z.string().trim().min(1).max(200) }),
  z.object({
    type: z.literal('MISSING_CLOCK_OUT'),
    proposedClockOutAt: z.string().datetime(),
    reason: z.string().trim().min(1).max(200),
  }),
]);
```

| 규칙 | 에러 |
| --- | --- |
| 본인 근태만 | `NOT_FOUND` |
| 같은 근태에 PENDING 1개 | `409 CORRECTION_PENDING_EXISTS` |
| `TIME`은 둘 중 하나 이상 | `VALIDATION_FAILED` |
| `MISSING_CLOCK_OUT`은 상태가 `MISSING_CLOCK_OUT`일 때만 | `409 ATTENDANCE_NOT_EDITABLE` |
| `BREAK_WAIVED`는 `CLOSED`이고 `breakWaived = false`일 때만 | `409 ATTENDANCE_NOT_EDITABLE` |
| 제안 퇴근 > 출근, 퇴근 ≤ 요청 시각, 근무 길이 ≤ 24h | `VALIDATION_FAILED` |
| `VOID` 근태 | `409 ATTENDANCE_NOT_EDITABLE` |
| 근무일로부터 35일 지난 근태 | `409 CORRECTION_WINDOW_CLOSED` (정산 확정 이후 변경 방지) |

직원은 PENDING 요청을 취소할 수 있다 (`CANCELED`).

### 7.2 "휴게 못 함"

퇴근 완료 화면·본인 기록에서 `BREAK_WAIVED` 요청을 만든다. 사유 기본값 "바빠서 휴게시간을 못 썼어요". 승인되면 `breakWaived = true` → 휴게 차감 0 (`payroll` §3.2).
휴게를 직접 남긴 근무(§3.6)는 남긴 휴게만 빼므로 `breakWaived`를 쓰지 않는다. 이 근무의 `BREAK_WAIVED` 요청은 `409 BREAK_ALREADY_RECORDED`, 화면에는 "휴게 못 했어요"를 보여 주지 않는다.

### 7.3 승인·반려 (관리자)

- 승인: 트랜잭션에서 근태 반영 → `AttendanceRevision(before, after, correctionRequestId)` → 요청 `APPROVED` → §6 재실행.
  - `MISSING_CLOCK_OUT` 승인 시 `status = CLOSED`.
  - 승인 시 관리자가 제안 시각을 고쳐서 승인할 수 있다 (`decisionNote`에 사유).
- 반려: `decisionNote` 필수. 근태 변경 없음.
- 승인 결과가 OPEN 유니크·CHECK 제약을 어기면 `409 ATTENDANCE_CONFLICT`.

### 7.4 관리자 직접 수정

```ts
const AdminUpdateAttendanceBody = z.object({
  clockInAt: z.string().datetime().optional(),
  clockOutAt: z.string().datetime().nullable().optional(),
  breakWaived: z.boolean().optional(),
  status: z.literal('VOID').optional(),
  reason: z.string().trim().min(1).max(200),
});
```

- 시각을 바꿔도 `termsId`는 바꾸지 않는다. 단, 새 `clockInAt`이 다른 근로조건 기간이면 그 버전으로 다시 연결한다 (시급 적용 일관성).
- 겹침 검사: 같은 직원의 무효가 아닌 다른 근무와 시간이 겹치면 `ATTENDANCE_CONFLICT`. 퇴근 시각이 없는 기록은 근무 중(`OPEN`)만 끝나지 않은 것으로 본다 (퇴근 누락은 끝을 모르므로 막지 않는다).
- 목록·상세는 정산 기간 단위 (`?periodStart=`, 생략 시 오늘이 속한 기간). 인정 시간은 정산과 같은 계산 (`payroll` §3).
- 근태가 아예 없는 날(QR을 못 찍은 날)은 §7.5로 새로 만든다.
- 근무 중 기록에 퇴근 시각을 넣거나 무효로 하면 열린 휴게를 닫는다 (§3.6). 휴게 시각은 §7.6에서 따로 고친다.

### 7.5 관리자 근태 추가 (Q7 결정, 2026-11-12)

QR을 못 찍어 기록이 없는 근무를 Owner·Manager(`ATTENDANCE_ADMIN`)가 직접 만든다.

```ts
const AdminCreateAttendanceBody = z.object({
  memberId: z.string().min(1),
  clockInAt: z.string().datetime(),
  clockOutAt: z.string().datetime(),
  breakWaived: z.boolean().default(false),
  reason: z.string().trim().min(1).max(200),
});
```

| 규칙 | 에러 |
| --- | --- |
| Owner·Manager만 | `403 FORBIDDEN` |
| 이 매장 직원이 아니면 | `404 NOT_FOUND` |
| 퇴근 > 출근, 퇴근 ≤ 지금, 근무 길이 ≤ 24h | `VALIDATION_FAILED` |
| 근무일(출근 시각의 매장 날짜)이 §7.1 35일 기한 밖 | `409 CORRECTION_WINDOW_CLOSED` "35일이 지난 날짜에는 근무를 추가할 수 없어요." |
| 같은 직원의 다른 근무와 겹침 (§7.4 겹침 규칙 그대로) | `409 ATTENDANCE_CONFLICT` |
| 출근 시각에 유효한 근로조건 없음 | `409 TERMS_NOT_SET` "그날 적용되는 근로조건이 없어요. 근로조건을 먼저 등록해 주세요." |

- 상태는 `CLOSED`, `termsId`는 출근 시각에 유효한 버전. 위치 필드는 비운다 ("매장 밖" 배지 없음).
- 같은 트랜잭션에서 `AttendanceRevision(before = null, after, reason, actor)`를 남긴다. 목록에는 "수정됨" 배지가 붙는다.
- 저장 뒤 §6 검토를 다시 돌린다. 정산·임금명세서는 근태를 읽어 계산하므로 따로 처리하지 않는다.
- 비활성 직원도 추가할 수 있다 (퇴사 전 빠진 근무). 직원 선택 목록은 재직 중인 직원만 보여 준다.

### 7.6 관리자 휴게 고치기 (2026-11-12)

직원이 휴게 끝을 늦게 눌렀거나 잘못 남긴 휴게를 Owner·Manager(`ATTENDANCE_ADMIN`)가 고친다. 근무 하나의 휴게를 **통째로 바꾼다** (보낸 목록이 그 근무의 휴게 전부).

```ts
// PUT /attendances/:id/breaks
const AdminReplaceBreaksBody = z.object({
  breaks: z.array(z.object({ startAt: z.string().datetime(), endAt: z.string().datetime() })).max(20),
  reason: z.string().trim().min(1).max(200),
});
```

| 규칙 | 에러 |
| --- | --- |
| Owner·Manager만 | `403 FORBIDDEN` (다른 매장 근무는 `404 NOT_FOUND`) |
| 근무 중(`OPEN`) | `409 ATTENDANCE_NOT_EDITABLE` "근무 중인 기록의 휴게는 직원이 남겨요. 퇴근한 뒤에 고쳐 주세요." |
| 퇴근 누락(`MISSING_CLOCK_OUT`) | `409 ATTENDANCE_NOT_EDITABLE` "퇴근 시각을 먼저 넣어 주세요." (§7.4로 퇴근 시각부터) |
| 무효(`VOID`) | `409 ATTENDANCE_NOT_EDITABLE` |
| 근무일이 §7.1 35일 기한 밖 | `409 CORRECTION_WINDOW_CLOSED` "35일이 지난 근무는 휴게를 고칠 수 없어요." |
| 휴게가 `[출근, 퇴근]` 밖 | `VALIDATION_FAILED` "휴게는 출근과 퇴근 사이로 넣어 주세요." |
| 끝 ≤ 시작 | `VALIDATION_FAILED` "휴게 끝이 시작보다 늦어야 해요." |
| 휴게끼리 겹침 (맞닿는 건 된다) | `VALIDATION_FAILED` "휴게 시간이 서로 겹쳐요." |

- 빈 목록도 된다: 기록한 휴게가 없어져 정산은 소정 휴게를 뺀다 (`payroll` §3.2). 1분 미만 휴게도 저장은 하지만 정산·검토에는 안 들어간다 (§3.6).
- 트랜잭션: Membership `FOR UPDATE` 잠금 → 근무를 다시 읽어 상태·기한·휴게 검사 → 휴게 행 전부 지우고 새로 넣음 → `AttendanceRevision(before, after, reason, actor)`. before/after는 근무 스냅샷에 `breaks: { startAt, endAt }[]`를 더한 것 (휴게 고치기 이력에만 있다. 이전 이력은 `breaks`가 없고 화면은 근무 시각만 보여 준다).
- 저장 뒤 §6 검토를 다시 돌린다 (`BREAK_SHORTAGE` 등). 정산·임금명세서는 근태·휴게를 읽어 계산하므로 따로 처리하지 않는다.
- 화면: 근태 상세 휴게 기록의 [휴게 고치기] → 시트. 지금 휴게(1분 이상, 근무 안으로 잘라서)를 시작·끝 시각(`HH:mm`) 줄로 채운다. 줄 추가·지우기, 이유 필수. 시각은 출근부터 24시간 안에서 처음 오는 그 시각으로 본다 (자정을 넘는 근무면 출근보다 이른 시각은 다음 날). 출근·퇴근과 같은 분이면 그 경계 시각으로 맞춘다. 서버와 같은 규칙을 입력 중에 확인해 안내하고 저장을 끈다. "1분이 안 되는 휴게는 정산에 넣지 않아요." 안내. 성공하면 토스트 "휴게를 고쳤어요" → 시트 닫고 다시 불러온다. 변경 이력에는 "휴게 20:00~20:20 → 20:00~20:10"처럼 앞뒤 휴게를 보여 준다 (없으면 "없음").

## 8. 화면

| URL | 사용자 | 요소 |
| --- | --- | --- |
| `/p/[qrToken]` | 직원 | §3.1 |
| `/me` | 직원 | 매장 선택(여러 곳이면), 근무 중 카드(휴게 시작·끝, "휴게 중 · n분", §3.6), 정산 기간 이동, 이번 기간 근무일·인정 시간·예상 금액(기본급 + 주휴·가산·유급휴일, `payroll` §3.6·§3.7), 근무 목록(배지·"확인 중" 요청) |
| `/owner/[storeId]/corrections` | 관리자 | 대기 중 요청(오래된 순): 지금 기록 → 요청한 값, 사유, 승인 / 반려(사유 필수). 시각을 고쳐서 처리하려면 근태 상세에서 직접 수정 |
| `/me/attendances/[id]` | 직원 | 상세, "휴게 못 했어요"(정상 종료·휴게 차감된 근무), 시각 수정·퇴근 시각 입력 요청, 보낸 요청과 사장님 답변, 대기 중 요청 취소 |
| `/owner/[storeId]/attendances` | 관리자 | 기간·직원 필터, 상태 배지(근무 중·누락·매장 밖·수정됨·무효), 대기 중 요청 탭, "근무 추가" 시트(직원·날짜·출근·퇴근·휴게 못 함·사유, 퇴근이 출근보다 이르면 다음 날로 본다. 같은 시각이면 추가 버튼을 끄고 안내 — 서버도 퇴근 ≤ 출근은 `VALIDATION_FAILED`) → 성공 토스트·목록 갱신 (§7.5) |
| `/owner/[storeId]/attendances/[id]` | 관리자 | 상세, 휴게 기록(시각·합계, §3.6)과 끝난 근무의 "휴게 고치기" 시트(§7.6), 직접 수정, 변경 이력 |

## 9. API

| Method | Endpoint | 권한 |
| --- | --- | --- |
| GET | `/attendance/punch-preview?qrToken=` | 등록 기기 |
| POST | `/attendance/punch` | 등록 기기 + Membership |
| GET | `/attendance/current?storeId=` | 본인 |
| POST | `/attendance/break/start` | 본인. body `{ storeId }`, 근무 중일 때 (§3.6) |
| POST | `/attendance/break/end` | 본인. body `{ storeId }` (§3.6) |
| GET | `/attendance/me?storeId=&from=&to=` | 본인 |
| GET | `/stores/:storeId/attendances?from=&to=&memberId=&status=` | 관리자 |
| POST | `/stores/:storeId/attendances` | 관리자. 근태 추가 (§7.5) |
| GET | `/attendances/:id` | 관리자, 본인 |
| PATCH | `/attendances/:id` | 관리자 |
| PUT | `/attendances/:id/breaks` | 관리자. 끝난 근무의 휴게를 통째로 바꾼다 (§7.6) |
| GET | `/attendances/:id/revisions` | 관리자 |
| POST | `/attendances/:id/correction-requests` | 본인 |
| GET | `/stores/:storeId/correction-requests?status=PENDING` | 관리자 |
| POST | `/correction-requests/:id/approve` | 관리자. body `{ clockInAt?, clockOutAt?, decisionNote? }` |
| POST | `/correction-requests/:id/reject` | 관리자. body `{ decisionNote }` |
| POST | `/correction-requests/:id/cancel` | 요청자 |

## 10. 에러 코드

| code | HTTP | 메시지 |
| --- | --- | --- |
| `QR_TOKEN_INVALID` | 404 | QR을 확인할 수 없어요. |
| `QR_TOKEN_REVOKED` | 410 | 새 QR로 바뀌었어요. 매장에 붙은 최신 QR을 찍어 주세요. |
| `NOT_STORE_MEMBER` | 403 | 이 매장 직원이 아니에요. 사장님께 초대를 요청해 주세요. |
| `TERMS_NOT_SET` | 409 | 근로조건이 아직 등록되지 않았어요. 사장님께 알려 주세요. (관리자 근태 추가는 §7.5 문구) |
| `PUNCH_ACTION_MISMATCH` | 409 | 이미 다른 기기에서 기록됐어요. 다시 확인해 주세요. |
| `PUNCH_TOO_SOON` | 409 | 방금 출근했어요. 1분 뒤에 퇴근할 수 있어요. |
| `IDEMPOTENCY_KEY_REUSED` | 422 | 요청을 다시 시작해 주세요. |
| `CORRECTION_PENDING_EXISTS` | 409 | 이미 처리 중인 수정 요청이 있어요. |
| `CORRECTION_WINDOW_CLOSED` | 409 | 35일이 지난 기록은 사장님께 직접 수정을 요청해 주세요. (관리자 근태 추가는 §7.5, 휴게 고치기는 §7.6 문구) |
| `ATTENDANCE_NOT_EDITABLE` | 409 | 지금 상태에서는 이 요청을 할 수 없어요. (휴게 고치기의 근무 중·퇴근 누락은 §7.6 문구) |
| `ATTENDANCE_CONFLICT` | 409 | 다른 근무 기록과 겹쳐요. |
| `NOT_WORKING` | 409 | 근무 중일 때만 휴게를 남길 수 있어요. |
| `BREAK_NOT_STARTED` | 409 | 시작한 휴게가 없어요. |
| `BREAK_ALREADY_RECORDED` | 409 | 휴게를 직접 남긴 근무는 휴게 못 함을 신청할 수 없어요. |

## 11. 수용 기준

- [ ] 출근 버튼을 3번 연타해도 Attendance는 1개, 응답 3번 모두 같은 `attendance.id`.
- [ ] 폰 2대로 같은 직원이 동시에 출근하면 1건 성공, 1건 `PUNCH_ACTION_MISMATCH`.
- [ ] 클라이언트 시각을 조작해도 기록 시각은 서버 시각.
- [ ] 월요일 18:00–23:00 직원이 23:00 이후 퇴근을 안 찍으면 화요일 03:00~03:10 사이 `MISSING_CLOCK_OUT`.
- [ ] `MISSING_CLOCK_OUT` 상태에서 QR을 찍으면 새 출근이 된다.
- [ ] 위치 정확도 300m면 "매장 밖" 판정을 하지 않는다.
- [ ] 수정 요청 승인 시 `AttendanceRevision`에 before/after가 남고 검토 항목이 다시 계산된다.
- [ ] Manager(`PAYROLL_READ` 없음) 근태 응답에 시급·금액 필드가 없다.
- [ ] 관리자가 빠진 근무를 추가하면 `CLOSED` 근태와 `before = null` 변경 이력이 생기고, 목록·정산에 바로 잡힌다.
- [ ] 근무 중 [휴게 시작]을 두 번 눌러도 열린 휴게는 1개. 근무 중이 아니면 `NOT_WORKING`, 휴게 중이 아닌데 [휴게 끝]이면 `BREAK_NOT_STARTED`.
- [ ] 휴게 중에 퇴근을 찍으면 휴게가 퇴근 시각으로 닫히고, 18:00–23:00 근무에 20:00–20:20 휴게면 인정 4시간 40분.
- [ ] 휴게 중에 퇴근 누락으로 바뀌면 휴게도 전환 시각으로 닫힌다.
- [ ] 휴게 20:00–20:20이 있는 근무의 퇴근을 19:30으로 당기면 휴게가 19:30–19:30(길이 0)으로 접혀 차감 0, 상세 합계도 0.
- [ ] 18:00–23:00 근무(소정 휴게 30분)의 휴게 20:00–20:05를 관리자가 19:00–19:30으로 바꾸면 인정 4시간 30분, 모두 지우면 소정 30분을 빼 인정 4시간 30분. 변경 이력 before/after에 휴게가 남는다.
- [ ] 근무 중인 기록의 휴게를 관리자가 바꾸려 하면 `ATTENDANCE_NOT_EDITABLE`, 휴게끼리 겹치거나 근무 밖이면 `VALIDATION_FAILED`.
