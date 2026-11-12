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

### 3.1 가게 검색 (카카오 로컬)

`GET /places/search?query=` (로그인 사장님). 카카오 로컬 키워드 검색을 서버가 대신 호출한다 (REST 키를 클라이언트에 두지 않는다).

```ts
interface PlaceDto {
  provider: 'KAKAO';
  placeId: string;        // 카카오 장소 id
  name: string;
  category: string | null;  // "음식점 > 카페"
  roadAddress: string | null;
  address: string | null;
  phone: string | null;
  latitude: number;
  longitude: number;
}
```

- 검색어 2~50자. 결과 최대 15개. 카페(`CE7`)·음식점(`FD6`)을 위로 정렬하되 다른 업종도 보여 준다 (주점·편의점 등).
- `KAKAO_REST_API_KEY`가 없으면 개발용 고정 목록에서 이름으로 찾는다 (production이면 `INTERNAL`).
- 검색 결과에 없으면 "직접 입력"으로 이름·주소만 넣는다 (좌표 없음 → 매장 밖 판정 안 함).

### 3.2 사업자 확인 (국세청)

`POST /business-registrations/verify` body `{ businessNumber }` (로그인 사장님).

1. 10자리 숫자로 정규화 (`123-45-67890` 허용) → 체크섬 검사. 틀리면 `400 BUSINESS_NUMBER_INVALID` (외부 호출 안 함)
2. 국세청 사업자등록 상태조회 (`api.odcloud.kr/api/nts-businessman/v1/status`)
3. 응답 `{ businessNumber, status: 'ACTIVE' | 'SUSPENDED' | 'CLOSED' | 'NOT_FOUND', taxType }`

| 국세청 `b_stt_cd` | status |
| --- | --- |
| `01` 계속사업자 | `ACTIVE` |
| `02` 휴업자 | `SUSPENDED` |
| `03` 폐업자 | `CLOSED` |
| 빈 값 (등록되지 않은 번호) | `NOT_FOUND` |

- `NTS_SERVICE_KEY`가 없으면 개발용: 체크섬만 맞으면 `ACTIVE` (production이면 `INTERNAL`).
- 외부 호출 실패·타임아웃(5초)은 `502 BUSINESS_LOOKUP_FAILED`. 사업자번호는 **MVP에서 선택 입력**이라 화면은 "나중에 입력"으로 넘어갈 수 있다.
- 상호·대표자는 이 API가 주지 않는다. 진위확인 API(대표자명·개업일 필요)는 세금계산서 발행 단계(P1)에서 검토.

### 3.3 입력

```ts
const CreateStoreBody = z.object({
  name: z.string().trim().min(1).max(30),
  address: z.string().trim().max(100).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  place: z.object({ provider: z.literal('KAKAO'), placeId: z.string() }).optional(),
  businessNumber: z.string().optional(),   // 입력 시 서버가 §3.2를 다시 확인
  payPeriodStartDay: z.number().int().min(1).max(28).default(1),
  headcountBand: z.enum(['UNDER_5', 'FIVE_OR_MORE', 'UNKNOWN']),
}).refine((v) => (v.latitude == null) === (v.longitude == null), {
  message: '위도와 경도는 함께 입력해야 해요.',
});
```

- 검색 결과의 이름·주소·좌표를 그대로 보내되, 사장님이 이름을 고칠 수 있다 (예: "골목카페" → "골목카페 망원점").
- `businessNumber`가 있으면 서버가 국세청을 다시 조회한다. `ACTIVE`가 아니면 `409 BUSINESS_NOT_ACTIVE` (휴업·폐업·미등록). 클라이언트의 확인 결과는 믿지 않는다.
- 같은 장소(`place`)가 이미 운영 중인 매장으로 등록돼 있으면 `409 STORE_PLACE_TAKEN` "이미 등록된 가게예요. 사장님께 초대를 요청해 주세요." (폐업 처리된 매장은 제외)

### 3.4 트랜잭션

1. `Store` 생성 (`businessNumber`·`businessVerifiedAt`·`placeProvider`·`placeId` 포함)
2. `Membership(role=OWNER, status=ACTIVE)`
3. `StoreQrToken` 생성 → 원문 토큰 응답에 포함
4. `StoreHeadcountDeclaration(effectiveFrom = 오늘)`
5. `Subscription(plan=PILOT, status=TRIALING, 30일)`

응답: `{ store: { id, name }, qr: { url } }`. 생성 직후 화면에서 QR 출력으로 이어진다.

### 3.5 매장 수 제한

User당 Owner 매장 10개 (남용 방지). 초과 시 `409 STORE_LIMIT_REACHED`.

### 3.6 화면 흐름 `/owner/stores/new`

1. 가게 검색 → 결과 선택 (또는 직접 입력)
2. 이름 확인·수정
3. 사업자번호 (선택) → "확인" 시 §3.2 결과 표시
4. 사업장 규모 선택
5. "매장 만들기" → 매장 QR 표시 (인쇄·저장)

## 4. 매장 수정

- `name`, `address`, `latitude`, `longitude`, `payPeriodStartDay`, `payDay`.
- `payDay` 급여 지급일 (1~31, `null`이면 지운다). 바로 적용되고, 임금명세서 초안의 지급일 기본값이 된다 (`payslip` §3.4).
- `payPeriodStartDay`를 바꾸면 **다음 정산 기간부터** 적용한다. 현재 진행 중인 기간은 그대로. 변경 내역은 `Store.payPeriodStartDay`·`previousPayPeriodStartDay`·`payPeriodStartDayEffectiveFrom`(= 지금 기간의 끝)으로 관리한다.
- 바뀌는 날을 경계로 짧은 전환 기간이 생긴다. 예: 1일 → 21일, 12/1부터 → `11/1~12/1`, `12/1~12/21`, `12/21~1/21`.
- 적용 전(대기 중)에 다시 바꾸면 값만 바뀌고 적용일은 그대로. 원래 값으로 되돌리면 변경 취소.
- 변경 이력은 1단계만 보관한다. 두 번 바뀐 뒤 아주 오래된 기간을 다시 보면 계산이 달라질 수 있다 (P1: 시작일 이력 테이블).

> 스키마: `Store.previousPayPeriodStartDay`, `Store.payPeriodStartDayEffectiveFrom` (둘은 함께 있거나 함께 없음, CHECK). 정산 기간 계산은 `payroll` §3.1.

## 5. QR 토큰

### 5.1 형식

| 항목 | 값 |
| --- | --- |
| 원문 | 32바이트 난수, base64url (43자) |
| 저장 | `sha256(원문)` hex → `tokenHash` (출퇴근 판정은 이것만) |
| 암호문 | AES-256-GCM `v1.<iv>.<ct+tag>` → `tokenCiphertext`. 키 `QR_TOKEN_ENC_KEY` (docs/specs/qr-card §3.1) |
| URL | `https://<도메인>/p/<원문>` |
| 활성 | 매장당 1개 (`revokedAt IS NULL`, 부분 유니크) |

### 5.2 재발급

1. 트랜잭션에서 기존 활성 토큰 `revokedAt = now()` → 새 토큰 생성
2. 응답에 새 원문
3. 확인 다이얼로그: "새 QR을 만들면 지금 붙어 있는 QR과 NFC 스티커는 바로 쓸 수 없어요. NFC는 새 주소로 다시 써 주세요."

### 5.3 원문 재조회

Owner는 `GET /stores/:storeId/qr` 로 다시 볼 수 있다 (docs/specs/qr-card §3.2). 원문은 암호문으로만 저장하고, 이 기능 전에 만든 토큰(암호문 없음)은 `url: null` 이라 재발급을 안내한다.

### 5.4 출력

- 매장 생성 직후와 설정의 "새 QR 만들기" 직후 화면에서 QR 미리보기 + 인쇄 + PNG 저장 + "QR 카드 만들기" 링크 (docs/specs/qr-card).
- QR 이미지는 클라이언트에서 생성.
- 스탠드·스티커 카드 제작은 QR 카드 화면(`/owner/[storeId]/qr-card`, docs/specs/qr-card)이 맡는다.

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

## 8. API

| Method | Endpoint | 권한 |
| --- | --- | --- |
| GET | `/places/search?query=` | 로그인 |
| POST | `/business-registrations/verify` | 로그인 |
| POST | `/stores` | 로그인 |
| GET | `/stores` | 로그인 — 본인 Membership이 있는 매장 |
| GET | `/stores/:storeId` | 소속 — 이름·내 역할 |
| GET | `/stores/:storeId/settings` | Owner — 이름·주소·정산 시작일(대기 중 변경)·사업장 규모 이력·QR 발급일 |
| PATCH | `/stores/:storeId` | Owner |
| POST | `/stores/:storeId/qr/rotate` | Owner |
| POST | `/stores/:storeId/headcount-declarations` | Owner |
| GET | `/stores/:storeId/headcount-declarations` | Owner |

## 9. 에러 코드

| code | HTTP | 메시지 |
| --- | --- | --- |
| `STORE_LIMIT_REACHED` | 409 | 매장은 10개까지 만들 수 있어요. |
| `STORE_PLACE_TAKEN` | 409 | 이미 등록된 가게예요. 사장님께 초대를 요청해 주세요. |
| `BUSINESS_NUMBER_INVALID` | 400 | 사업자등록번호를 확인해 주세요. |
| `BUSINESS_NOT_ACTIVE` | 409 | 영업 중인 사업자만 등록할 수 있어요. |
| `BUSINESS_LOOKUP_FAILED` | 502 | 사업자 정보를 확인하지 못했어요. 잠시 후 다시 시도해 주세요. |
| `HEADCOUNT_DATE_OUT_OF_RANGE` | 400 | 최근 90일 안의 날짜만 선택할 수 있어요. |

## 10. 수용 기준

- [ ] 매장 생성 트랜잭션 중 하나라도 실패하면 아무것도 남지 않는다.
- [ ] QR 재발급 직후 이전 토큰으로 punch하면 `QR_TOKEN_REVOKED`.
- [ ] DB 어디에도 QR 원문이 없다.
- [ ] 규모를 `UNDER_5`(11/1) → `FIVE_OR_MORE`(11/15)로 신고하면, 11/10 근무는 `UNDER_5`, 11/20 근무는 `FIVE_OR_MORE`로 판정된다.
- [ ] 정산 시작일을 바꿔도 현재 정산 기간 범위는 바뀌지 않는다.
