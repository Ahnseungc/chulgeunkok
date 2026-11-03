# 매장·QR·사업장 규모 — 기능 스펙

| 항목 | 값 |
| --- | --- |
| 상태 | **Draft** (2026-11-03) |
| PRD | [§3.1, §4 STORE-01~03, §5.5](../../prd-v0.4.md) |
| 인덱스 | [../README.md](../README.md) |

---

## 1. 개요

1. 사장님이 매장을 만들면 Owner Membership, QR 토큰, 사업장 규모 신고, 파일럿 구독이 **한 트랜잭션**으로 생긴다.
2. QR은 `https://<도메인>/p/<token>` URL을 담는다. 토큰 원문은 생성·재발급 응답에서만 보이고, DB에는 해시만 있다.
3. 사업장 규모는 사장님이 신고한다. 등록 직원 수로 추정하지 않는다.

## 2. 범위 / 비목표

| 포함 | 제외 |
| --- | --- |
| 매장 생성·수정 | 매장 삭제 (상태 `CLOSED`는 운영자만) |
| QR 생성·출력용 이미지·재발급 | 동적 QR·키오스크 (P1) |
| 사업장 규모 신고·이력 | 출근 기록 기반 규모 추정 (P1) |
| 정산 시작일 설정 | 시간대 변경 (MVP `Asia/Seoul` 고정) |

## 3. 매장 생성

### 3.1 입력

```ts
const CreateStoreBody = z.object({
  name: z.string().trim().min(1).max(30),
  address: z.string().trim().max(100).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  payPeriodStartDay: z.number().int().min(1).max(28).default(1),
  headcountBand: z.enum(['UNDER_5', 'FIVE_OR_MORE', 'UNKNOWN']),
}).refine((v) => (v.latitude == null) === (v.longitude == null), {
  message: '위도와 경도는 함께 입력해야 해요.',
});
```

좌표는 주소 검색 결과에서 채운다. 없으면 "매장 밖" 판정을 하지 않는다 (`attendance` §4).

### 3.2 트랜잭션

1. `Store` 생성
2. `Membership(role=OWNER, status=ACTIVE)`
3. `StoreQrToken` 생성 → 원문 토큰 응답에 포함
4. `StoreHeadcountDeclaration(effectiveFrom = 오늘)`
5. `Subscription(plan=PILOT, status=TRIALING)`

응답: `{ store, qr: { url, token } }`. 생성 직후 화면에서 QR 출력으로 이어진다.

### 3.3 매장 수 제한

User당 Owner 매장 10개 (남용 방지). 초과 시 `409 STORE_LIMIT_REACHED`.

## 4. 매장 수정

- `name`, `address`, `latitude`, `longitude`, `payPeriodStartDay`.
- `payPeriodStartDay`를 바꾸면 **다음 정산 기간부터** 적용한다. 현재 진행 중인 기간은 그대로. 변경 내역은 `Store.payPeriodStartDay`와 `payPeriodStartDayEffectiveFrom`으로 관리한다.

> 스키마: `Store.previousPayPeriodStartDay`, `Store.payPeriodStartDayEffectiveFrom` (둘은 함께 있거나 함께 없음, CHECK). 정산 기간 계산은 `payroll` §3.1.

## 5. QR 토큰

### 5.1 형식

| 항목 | 값 |
| --- | --- |
| 원문 | 32바이트 난수, base64url (43자) |
| 저장 | `sha256(원문)` hex → `tokenHash` |
| URL | `https://<도메인>/p/<원문>` |
| 활성 | 매장당 1개 (`revokedAt IS NULL`, 부분 유니크) |

### 5.2 재발급

1. 트랜잭션에서 기존 활성 토큰 `revokedAt = now()` → 새 토큰 생성
2. 응답에 새 원문
3. 확인 다이얼로그: "새 QR을 만들면 지금 붙어 있는 QR과 NFC 스티커는 바로 쓸 수 없어요. NFC는 새 주소로 다시 써 주세요."

### 5.3 원문 재조회

원문은 저장하지 않으므로 다시 볼 수 없다. 출력물을 잃어버리면 재발급한다.

> 대안 검토: 원문을 KMS 암호화로 저장해 재출력을 허용. 사장님이 스티커를 다시 뽑을 일이 잦다면 P1에서 도입. ponytail: MVP는 재발급으로 충분하다.

### 5.4 출력

- `/owner/[storeId]/settings/qr` 에서 A6 스티커 레이아웃(`assets/brand/출근콕-QR스티커.png` 기준) 미리보기 + 인쇄 + PNG 저장.
- QR 이미지는 클라이언트에서 생성 (원문은 재발급 직후 메모리에만).

## 6. 사업장 규모 신고

### 6.1 입력

```ts
const DeclareHeadcountBody = z.object({
  band: z.enum(['UNDER_5', 'FIVE_OR_MORE', 'UNKNOWN']),
  effectiveFrom: z.string().date(),  // 매장 시간대 날짜
  note: z.string().max(200).optional(),
});
```

- `effectiveFrom`은 오늘 이전 90일 ~ 오늘 사이. 같은 날짜에 이미 있으면 덮어쓴다(upsert).

### 6.2 적용

- 특정 근무일의 규모 = `effectiveFrom <= 근무일` 중 가장 최근 신고. 없으면 `UNKNOWN`.
- 신고를 바꾸면 그 날 이후 근무의 검토 항목 **표시 방식**만 바뀐다 (`labor` §6). 검토 항목 자체는 지우지 않는다.

### 6.3 안내 바텀시트

"상시근로자 수는 등록한 직원 수가 아니라, 지난 1개월 동안 일한 사람 수를 일한 날 수로 나눈 값이에요. 아르바이트도 포함돼요." + "잘 모르겠어요" 선택지.

## 7. 화면

| URL | 요소 |
| --- | --- |
| `/owner/stores/new` | 매장명, 주소 검색, 규모 선택(바텀시트 안내), 완료 → QR 출력 |
| `/owner/[storeId]/settings` | 매장 정보, 정산 시작일, 사업장 규모(현재 값 + 이력), QR 재발급 |
| `/owner/[storeId]/settings/qr` | 스티커 미리보기·인쇄·저장 |

## 8. API

| Method | Endpoint | 권한 |
| --- | --- | --- |
| POST | `/stores` | 로그인 |
| GET | `/stores` | 로그인 — 본인 Membership이 있는 매장 |
| GET | `/stores/:storeId` | 소속 |
| PATCH | `/stores/:storeId` | Owner |
| POST | `/stores/:storeId/qr/rotate` | Owner |
| POST | `/stores/:storeId/headcount-declarations` | Owner |
| GET | `/stores/:storeId/headcount-declarations` | Owner |

## 9. 에러 코드

| code | HTTP | 메시지 |
| --- | --- | --- |
| `STORE_LIMIT_REACHED` | 409 | 매장은 10개까지 만들 수 있어요. |
| `HEADCOUNT_DATE_OUT_OF_RANGE` | 400 | 최근 90일 안의 날짜만 선택할 수 있어요. |

## 10. 수용 기준

- [ ] 매장 생성 트랜잭션 중 하나라도 실패하면 아무것도 남지 않는다.
- [ ] QR 재발급 직후 이전 토큰으로 punch하면 `QR_TOKEN_REVOKED`.
- [ ] DB 어디에도 QR 원문이 없다.
- [ ] 규모를 `UNDER_5`(11/1) → `FIVE_OR_MORE`(11/15)로 신고하면, 11/10 근무는 `UNDER_5`, 11/20 근무는 `FIVE_OR_MORE`로 판정된다.
- [ ] 정산 시작일을 바꿔도 현재 정산 기간 범위는 바뀌지 않는다.
