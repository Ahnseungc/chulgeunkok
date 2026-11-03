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

## 2. 범위 / 비목표

| 포함 | 제외 |
| --- | --- |
| QR punch, 자동 토글, 멱등 | 실제 휴게 시작·종료 기록 (P1) |
| 출근 위치 기록·"매장 밖" 배지 | 위치로 출근 차단 |
| 퇴근 누락 자동 전환 | 퇴근 누락 푸시 알림 (P1) |
| 수정 요청 (시각, 휴게 못 함, 퇴근 누락) | 교대 근무 변경 요청 (P2) |
| 관리자 직접 수정·무효 처리 | 관리자가 근태 새로 생성 — **미지원, §7.4 참고** |

## 3. Punch

### 3.1 QR 랜딩 `/p/[qrToken]`

| 순서 | 조건 | 화면 |
| --- | --- | --- |
| 1 | 토큰 해시 없음 | "QR을 확인할 수 없어요" |
| 2 | 폐기된 토큰 | "새 QR로 바뀌었어요. 매장에 붙은 최신 QR을 찍어 주세요." |
| 3 | 미로그인 | `/login?callbackUrl=/p/<token>` |
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

## 4. 출근 위치

- `location`이 있고 매장 좌표가 있으면 haversine 거리 계산.
- `clockInOutsideArea = distance > 200m && accuracyM <= 100`. 정확도가 100m를 넘으면 `null`(판정 불가).
- 관리자 근태 목록에 "매장 밖" 배지. 직원 화면에는 보이지 않는다.
- 위치는 출근 1회만. 퇴근 위치는 받지 않는다. 1년 뒤 일배치로 좌표 3개 필드를 `null`로 지운다.

## 5. 퇴근 누락

### 5.1 자동 전환 (10분 주기 배치)

OPEN 근무 중 `now > 기준시각`인 것을 `MISSING_CLOCK_OUT`으로 바꾼다.

| 경우 | 기준시각 |
| --- | --- |
| 출근 요일에 소정 스케줄 있음 | 소정 퇴근 시각 + 4시간 (출근이 소정 시작보다 늦어도 소정 퇴근 기준) |
| 소정 스케줄 없음 | `clockInAt + 16시간` |

- 소정 퇴근 시각 = 출근 날짜(매장 시간대)의 `startMinute + workMinutes`.
- 전환은 `AttendanceRevision`에 `actorId = 시스템 사용자`, `reason = 'AUTO_MISSING_CLOCK_OUT'`.

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
- **근태 새로 만들기는 MVP 미지원.** QR을 못 찍은 날은 직원이 다음 날 찍지 않은 이상 기록이 없다. → 미결정 Q7: "관리자 근태 추가"를 P0에 넣을지. 넣는다면 `AttendanceRevision.before = null`.

## 8. 화면

| URL | 사용자 | 요소 |
| --- | --- | --- |
| `/p/[qrToken]` | 직원 | §3.1 |
| `/me` | 직원 | 매장 선택, 오늘 상태, 이번 정산기간 근무 목록·합계, 퇴근 누락 카드, 수정 요청 상태 |
| `/me/attendances/[id]` | 직원 | 상세, 수정 요청 |
| `/owner/[storeId]/attendances` | 관리자 | 기간·직원 필터, 상태 배지(근무 중·누락·매장 밖·수정됨·무효), 대기 중 요청 탭 |
| `/owner/[storeId]/attendances/[id]` | 관리자 | 상세, 직접 수정, 변경 이력 |

## 9. API

| Method | Endpoint | 권한 |
| --- | --- | --- |
| GET | `/attendance/punch-preview?qrToken=` | 로그인 |
| POST | `/attendance/punch` | 로그인 + Membership |
| GET | `/attendance/current?storeId=` | 본인 |
| GET | `/attendance/me?storeId=&from=&to=` | 본인 |
| GET | `/stores/:storeId/attendances?from=&to=&memberId=&status=` | 관리자 |
| GET | `/attendances/:id` | 관리자, 본인 |
| PATCH | `/attendances/:id` | 관리자 |
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
| `TERMS_NOT_SET` | 409 | 근로조건이 아직 등록되지 않았어요. 사장님께 알려 주세요. |
| `PUNCH_ACTION_MISMATCH` | 409 | 이미 다른 기기에서 기록됐어요. 다시 확인해 주세요. |
| `PUNCH_TOO_SOON` | 409 | 방금 출근했어요. 1분 뒤에 퇴근할 수 있어요. |
| `IDEMPOTENCY_KEY_REUSED` | 422 | 요청을 다시 시작해 주세요. |
| `CORRECTION_PENDING_EXISTS` | 409 | 이미 처리 중인 수정 요청이 있어요. |
| `CORRECTION_WINDOW_CLOSED` | 409 | 35일이 지난 기록은 사장님께 직접 수정을 요청해 주세요. |
| `ATTENDANCE_NOT_EDITABLE` | 409 | 지금 상태에서는 이 요청을 할 수 없어요. |
| `ATTENDANCE_CONFLICT` | 409 | 다른 근무 기록과 겹쳐요. |

## 11. 수용 기준

- [ ] 출근 버튼을 3번 연타해도 Attendance는 1개, 응답 3번 모두 같은 `attendance.id`.
- [ ] 폰 2대로 같은 직원이 동시에 출근하면 1건 성공, 1건 `PUNCH_ACTION_MISMATCH`.
- [ ] 클라이언트 시각을 조작해도 기록 시각은 서버 시각.
- [ ] 월요일 18:00–23:00 직원이 23:00 이후 퇴근을 안 찍으면 화요일 03:00~03:10 사이 `MISSING_CLOCK_OUT`.
- [ ] `MISSING_CLOCK_OUT` 상태에서 QR을 찍으면 새 출근이 된다.
- [ ] 위치 정확도 300m면 "매장 밖" 판정을 하지 않는다.
- [ ] 수정 요청 승인 시 `AttendanceRevision`에 before/after가 남고 검토 항목이 다시 계산된다.
- [ ] Manager(`PAYROLL_READ` 없음) 근태 응답에 시급·금액 필드가 없다.
