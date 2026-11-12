# 인증 — 기능 스펙

| 항목 | 값 |
| --- | --- |
| 상태 | **Draft** (2026-11-03) — v2: 소셜 로그인 제거, 기기 등록 방식 |
| PRD | [§4 AUTH-01](../../prd-v0.4.md) |
| 인덱스 | [../README.md](../README.md) |

---

## 1. 개요

1. **로그인 화면이 없다.** 사람은 "등록된 기기"로 구분한다. 기기를 등록하면 오래 유지되는 쿠키가 생기고, 그 쿠키가 세션이다.
2. **직원**은 사장님이 보낸 초대 링크로 기기를 등록한다 (`staff` §3). 휴대폰 인증도 소셜 로그인도 없다.
3. **사장님**은 급여·시급을 보므로 휴대폰 인증번호(OTP)로 기기를 등록한다.
4. 매장은 QR·NFC가 알려 준다 (`/p/<토큰>`). 기기 쿠키는 **누가** 찍었는지, QR은 **어느 매장**인지를 맡는다.
5. 역할은 `Membership`에 있다. 같은 기기·같은 사람이 여러 매장에 소속될 수 있다.

> QR 사진이 공유돼도 등록된 기기가 없으면 출퇴근할 수 없다. 반대로 기기 쿠키만으로는 매장을 알 수 없어, 매장에 붙은 QR·NFC가 필요하다.

## 2. 범위 / 비목표

| 포함 | 제외 |
| --- | --- |
| 기기 쿠키 세션 | 카카오·소셜 로그인 |
| 직원: 초대 링크로 기기 등록 (`staff` §3) | 직원 휴대폰 인증 |
| 사장님: 휴대폰 OTP로 기기 등록 | 비밀번호 |
| 기기 재등록으로 이전 기기 폐기 | 기기 목록 관리 UI (P1) |
| NFC 태그 (QR과 같은 URL) | Web NFC API로 태그 쓰기 |

## 3. 기기 등록

### 3.1 기기 자격 증명

| 항목 | 값 |
| --- | --- |
| 원문 | 32바이트 난수, base64url |
| 저장 | `DeviceCredential.tokenHash = sha256(원문)`. 원문은 쿠키에만 |
| 소유 | `userId` (매장이 아니라 사람에 붙는다) |
| 폐기 | `revokedAt`. 폐기된 기기는 즉시 `UNAUTHENTICATED` |
| 1인 기기 수 | 제한 없음. 기기 재등록 시에는 **그 사람의 기존 기기 전부 폐기** |

### 3.2 쿠키

| 속성 | 값 |
| --- | --- |
| 이름 | `ck_device` |
| `HttpOnly` | ✅ |
| `Secure` | production ✅ |
| `SameSite` | `Lax` (QR·NFC로 열리는 첫 요청에 실려야 한다) |
| `Max-Age` | 400일 (브라우저 상한) |
| `Path` | `/` |

### 3.3 세션 판정 (요청마다)

1. `ck_device` 쿠키 → 해시 → `DeviceCredential` (`revokedAt IS NULL`)
2. 있으면 `userId`. 없으면 `UNAUTHENTICATED`
3. 개발 전용: `DEV_AUTH=1`이고 production이 아니면 `x-dev-user-id` 헤더 / `dev_user_id` 쿠키도 허용

`lastUsedAt` 갱신은 MVP에서 하지 않는다 (요청마다 쓰기 방지). 기기 목록 UI(P1)를 만들 때 하루 1회 갱신으로 넣는다.

### 3.4 기기를 잃었을 때

| 상황 | 처리 |
| --- | --- |
| 직원이 폰을 바꿈·브라우저 데이터 삭제 | 사장님이 직원 상세에서 "기기 재등록 링크" 발송 → 새 기기 수락 시 이전 기기 폐기 |
| 직원 폰 분실 | 위와 같음. 재등록 전까지 이전 폰으로 출근 가능한 상태가 남는다 |
| 사장님이 폰을 바꿈 | 새 기기에서 휴대폰 OTP (§4) |

### 3.5 브라우저 차이

- iOS Safari의 ITP는 **서버가 `Set-Cookie`로 심은 HttpOnly 쿠키**를 7일 만료 대상으로 보지 않는다 (JS로 만든 쿠키만 제한). 서버에서 심는다.
- QR 스캐너 앱의 인앱 브라우저는 쿠키 저장소가 다르다. 랜딩에서 미등록이면 "기본 카메라나 브라우저로 열어 주세요" 안내를 함께 보여 준다.
- 홈 화면에 추가한 PWA와 Safari는 쿠키를 공유하지 않는다 (iOS). MVP는 Safari 기준.

## 4. 사장님 인증 (휴대폰 OTP)

1. `/owner/login` → 번호 입력 → 6자리 코드 (유효 3분)
2. 코드 확인 → `phone`으로 User 조회, 없으면 생성 → 기기 등록 + 쿠키
3. `name` 없으면 이름 입력

| 항목 | 값 |
| --- | --- |
| 코드 | 6자리 숫자, 서버 난수, 해시만 저장 (`OtpCode`) |
| 시도 횟수 | 코드당 5회 |
| 재발송 | 번호당 60초에 1회, 하루 10회 |
| 번호 형식 | 국내 휴대폰만, E.164 |

- 코드 해시는 `sha256(phone + ':' + code)`. 유효 3분·5회 제한이 무차별 대입을 막는다.
- 같은 번호로 새 코드를 받으면 이전 미사용 코드는 `consumedAt`으로 닫는다 (마지막 코드만 유효).
- 인증에 성공하면 그 번호의 User로 기기를 등록한다. 번호가 없던 User(직원으로 먼저 등록된 사람)와는 합치지 않는다 — 직원은 번호를 입력한 적이 없기 때문.

### 4.1 SMS 발송 어댑터

| `SMS_PROVIDER` | 동작 |
| --- | --- |
| `dev` (기본) | 발송하지 않고 서버 로그에 코드 출력. production이 아니면 응답에 `devCode`도 넣는다 |
| `solapi` 등 | 공급자 계약 후 같은 인터페이스(`SmsSender.send(phone, text)`)로 추가 (인덱스 Q2) |

production에서 `dev`이면 서버 시작 시가 아니라 **발송 시점에** `INTERNAL`로 실패한다 (설정 누락을 숨기지 않는다).

- 본인인증(PASS 등)은 유료 구독 결제 단계에서 붙인다 (P1).
- 초대 링크로 들어온 Manager도 직원과 같은 기기 쿠키를 쓴다. 급여 권한을 받으면 §4.2 휴대폰 인증을 한 번 더 한다.

### 4.2 급여 권한 Manager 휴대폰 인증 (인덱스 Q8)

`PAYROLL_READ`를 받은 Manager는 초대 링크로만 기기를 등록해 번호가 없다. 급여를 보려면 `User.phone`이 있어야 한다.

| 대상 | 휴대폰 인증 전 |
| --- | --- |
| 정산 미리보기·CSV, 임금명세서 목록·상세 (`PAYROLL`) | `403 PHONE_VERIFICATION_REQUIRED` "급여를 보려면 휴대폰 인증이 필요해요." |
| 대시보드 예상 인건비 | 대시보드는 그대로 열고 금액만 `null`, `currentPeriod.phoneVerificationRequired = true` |
| 본인 임금명세서 (보낸 것) | 직원과 같게 볼 수 있다. DRAFT는 인증 뒤에만 |
| 근로조건 조회·검토 안내 (`TERMS_READ`·`LABOR_REVIEW`, 시급 포함) | `TERMS_EDIT`이 없으면 위와 같은 403. 직원 상세는 근로조건 구역을 숨기고, 대시보드는 검토 수를 숨긴다. `TERMS_EDIT` Manager는 그대로 |
| 사장님 | 묻지 않는다 (OTP로만 기기를 등록한다) |

- 판정은 공통 가드 `requireMembership`가 `PAYROLL` 동작일 때 한다. 숨기는 곳은 `canAccessVerified` (`PAYROLL`·`TERMS_READ`·`LABOR_REVIEW`). 본인 근로조건은 인증 없이 본다.
- 화면: 이 코드를 받으면 문구 + "휴대폰 인증하기" → `/owner/login?verify=1&next=<지금 경로>`. 대시보드는 이번 정산 기간 카드에 같은 안내.
- **번호 붙이기**: `verify=1`이면 `POST /auth/otp/verify`에 `attach: true`를 보낸다. 서버는 기기 세션 사용자에게 번호만 넣고 기기·쿠키는 바꾸지 않는다 (응답에 새 쿠키 없음, 앱 연결 코드도 보내지 않음). 세션이 없으면 `UNAUTHENTICATED`.
- 붙일 수 있는 사람: **번호가 없고**, 어느 매장에서든 **ACTIVE `PAYROLL_READ` Manager**. 아니면 `FORBIDDEN` (직원이 번호를 붙여 OTP로 기기를 늘리지 못하게, §3.4).
- 이미 번호가 있으면 바꾸지 않는다: 같은 번호면 그대로 성공, 다른 번호면 `409 PHONE_ALREADY_SET`. 쓰기는 `phone IS NULL`일 때만 하고, 동시에 다른 요청이 먼저 넣었으면 `PHONE_ALREADY_SET`, 같은 번호를 다른 사용자가 먼저 가져갔으면(유니크 위반) `PHONE_IN_USE`. 훔친 기기 쿠키로 계정 번호를 공격자 번호로 옮기지 못하게 한다. 번호 변경은 MVP에 없다.
- 그 번호가 이미 다른 사용자 것이면 `409 PHONE_IN_USE` — 두 사람을 합치지 않는다 (§4). 사장님이기도 한 사람은 사장님 번호로 로그인한 기기에서 급여를 본다.
- 번호를 붙인 Manager는 그 뒤 새 기기에서도 `/owner/login` OTP로 같은 사람으로 로그인할 수 있다 (사장님과 같은 경로). 기기 재등록 QR 없이 본인이 기기를 늘릴 수 있다 (번호를 인증한 사람이라 사장님과 같은 수준으로 본다).
- 인증 뒤 `next`로 돌아간다. `next`는 `/owner` 아래 경로만 받는다 (오픈 리다이렉트 방지, 쿼리 제외).
- `attach`가 없으면 기존 로그인 그대로다 (그 번호의 사용자로 새 기기 등록).

## 5. NFC

- NFC 스티커에 QR과 **같은 URL**(`https://<도메인>/p/<토큰>`)을 NDEF URI 레코드로 쓴다.
- iPhone(XS 이후)과 Android 모두 잠금 해제 상태에서 태그하면 기본 브라우저로 열린다. 별도 개발 없음.
- QR 재발급 시 NFC 태그도 다시 써야 한다 (같은 토큰). 재발급 확인 문구에 포함한다 (`store` §5.2).

## 6. RN 앱 셸 (Expo + WebView)

앱은 React Native(Expo) 셸이 Next.js 웹 화면을 `WebView`로 띄운다. 화면·비즈니스 로직은 웹에 있고, 네이티브는 카메라·NFC·보안 저장소·딥링크만 맡는다. 서버 세션은 웹과 같다.

### 6.1 역할 분담

| 기능 | 담당 | 내용 |
| --- | --- | --- |
| 화면 | 웹 (WebView) | `/p/[qrToken]`, `/invite/[token]`, `/owner/*` 등 전부 |
| QR 스캔 | 네이티브 | 카메라로 읽은 URL이 `<APP_ORIGIN>/p/` 로 시작하면 WebView를 그 주소로 이동. 아니면 무시 |
| NFC | 네이티브 | NDEF URI 레코드를 읽어 QR과 같은 처리 |
| 딥링크 | 네이티브 | 유니버설 링크·앱 링크 `<APP_ORIGIN>/p/*`, `/invite/*` → 앱이 열리고 WebView가 그 경로로 이동. 앱이 없으면 브라우저로 같은 웹 화면 |
| 기기 토큰 보관 | 네이티브 | 아래 §6.2 |
| 위치 | 앱 | 앱이 `expo-location`으로 받아 브릿지(`REQUEST_LOCATION`→`LOCATION`)로 웹에 넘긴다. WebView 위치 권한까지 두 번 묻지 않게. 앱 밖(브라우저)은 `navigator.geolocation` |

### 6.2 기기 토큰 흐름 (일회용 연결 코드)

WebView의 HttpOnly 쿠키를 네이티브가 직접 읽지 않는다 (Expo Go·새 아키텍처에서 쿠키 모듈을 쓸 수 없다). 대신 60초짜리 일회용 **연결 코드**(`DeviceHandoffCode`, 해시만 저장)로 넘긴다.

1. 초대 수락·사장님 OTP 인증 응답이 WebView에 `ck_device`(HttpOnly)를 심는다. 응답 본문에는 토큰이 없다.
2. 웹이 앱 안이면 `POST /api/v1/auth/handoff`(쿠키 세션)로 연결 코드를 받아 `DEVICE_REGISTERED { handoffCode }` 를 보낸다.
3. 네이티브는 `POST /api/v1/auth/handoff/redeem { code }` → `{ deviceToken }` 을 받아 SecureStore(Keychain·Keystore)에 둔다. 코드는 한 번 쓰면 끝이다 (조건부 `usedAt` 갱신).
4. 앱을 켤 때 SecureStore에 토큰이 있으면 `Authorization: Bearer` 로 연결 코드를 받고, WebView를 `/auth/restore?code=…&next=<경로>` 로 연다. 서버가 코드를 쓰고 새 `ck_device` 쿠키를 심은 뒤 `next`로 보낸다. WebView 쿠키가 지워져도 세션이 이어진다.
5. 서버가 기기를 폐기해 Bearer 요청이 401이면 네이티브는 SecureStore 토큰을 지우고 일반 경로로 연다.

- `next`는 `/me`, `/owner`, `/p/…`, `/invite/…` 만 허용한다 (오픈 리다이렉트 방지). 그 밖은 `/me`.
- 복원 실패(만료·사용된 코드)도 `next`로 보낸다. 쿠키가 없으니 해당 화면의 미등록 안내가 뜬다.

> 기기 토큰은 JS로 노출하지 않는다. JS에 보이는 값은 60초 일회용 코드뿐이라 웹에 XSS가 생겨도 영구 토큰은 빠지지 않는다.

### 6.3 웹 ↔ 네이티브 브릿지 (최소)

`window.ReactNativeWebView.postMessage` / `onMessage`. 메시지는 `packages/app-bridge`의 Zod 스키마로 검증한다.

| 방향 | type | payload | 용도 |
| --- | --- | --- | --- |
| 웹 → 앱 | `OPEN_SCANNER` | 없음 | `/me`의 "매장 QR 찍기" 버튼 |
| 웹 → 앱 | `DEVICE_REGISTERED` | `{ handoffCode }` | 초대 수락·사장님 인증 직후. 네이티브가 §6.2-3 실행 |
| 웹 → 앱 | `SAVE_FILE` | `{ fileName, mime: application/pdf·image/png, base64 }` | WebView 는 blob:·data: 다운로드를 못 한다. 앱이 캐시에 쓰고 공유 시트를 연다 (QR 카드 PDF·PNG, 매장 QR 이미지). base64 8MB 이하, 파일 이름에 경로 구분자 금지 |

- 스캔 결과는 메시지로 보내지 않는다. 네이티브가 `toAppPath`로 검증한 경로(`/p/…`, `/invite/…`, 같은 출처 또는 `chulgeunkok://`)로 WebView를 바로 연다. 그 밖의 QR은 "출근콕 QR이 아니에요" 안내.
- 웹은 `window.ReactNativeWebView` 존재로 앱 안인지 판단한다. 없으면 일반 웹 동작.
- WebView는 웹 출처만 안에서 연다. 다른 주소는 시스템 브라우저로 보낸다.

### 6.4 모노레포 배치

| 경로 | 내용 |
| --- | --- |
| `apps/web` | Next.js (화면 + API) |
| `apps/mobile` | Expo 셸 — WebView, QR 스캐너, SecureStore, 딥링크 (`chulgeunkok://`) |
| `packages/db` | Prisma 스키마·마이그레이션·DB 클라이언트 |
| `packages/app-bridge` | §6.3 메시지 스키마, 쿠키 이름, 딥링크 경로 검증 |

유니버설 링크·앱 링크(도메인 연결)와 앱 안 NFC 읽기는 도메인이 생기면 붙인다. 그 전에는 NFC 스티커 URL이 브라우저로 열린다.

## 7. 화면

| URL | 요소 |
| --- | --- |
| `/invite/[token]` | `staff` §3.3 |
| `/p/[qrToken]` 미등록 | "이 휴대폰은 아직 등록되지 않았어요. 사장님께 초대 링크를 요청해 주세요." + 인앱 브라우저 안내 |
| `/owner/login` | 휴대폰 번호 → 인증번호 → (처음이면) 이름 → `/owner` |
| `/owner/login?verify=1&next=…` | §4.2 번호 붙이기. 번호 → 인증번호 → `next` |

## 8. API

| Method | Endpoint | 설명 |
| --- | --- | --- |
| POST | `/auth/otp/send` | 사장님. body `{ phone }` |
| POST | `/auth/otp/verify` | 사장님. body `{ phone, code, attach? }` → 기기 등록 + 쿠키. 응답 `{ needsName }`. `attach: true`면 세션 사용자에게 번호만 (§4.2) |
| GET | `/me` | 현재 사용자 `{ id, name, hasPhone }`, 소속 매장 `{ storeId, storeName, role, status }[]` |
| PATCH | `/me` | body `{ name }` |
| POST | `/auth/logout` | 현재 기기 폐기 + 쿠키 삭제 |

## 9. 에러 코드

| code | HTTP | 메시지 |
| --- | --- | --- |
| `UNAUTHENTICATED` | 401 | 이 휴대폰은 아직 등록되지 않았어요. 사장님께 초대 링크를 요청해 주세요. |
| `OTP_INVALID` | 400 | 인증번호가 맞지 않아요. |
| `OTP_EXPIRED` | 410 | 인증번호가 만료됐어요. 다시 받아 주세요. |
| `OTP_TOO_MANY_ATTEMPTS` | 429 | 시도 횟수를 넘었어요. 인증번호를 다시 받아 주세요. |
| `OTP_RESEND_TOO_SOON` | 429 | 잠시 후 다시 요청해 주세요. |
| `PHONE_INVALID` | 400 | 휴대폰 번호를 확인해 주세요. |
| `PHONE_VERIFICATION_REQUIRED` | 403 | 급여를 보려면 휴대폰 인증이 필요해요. |
| `PHONE_IN_USE` | 409 | 이미 다른 계정에 등록된 번호예요. |
| `PHONE_ALREADY_SET` | 409 | 이미 다른 번호로 인증했어요. |

## 10. 수용 기준

- [ ] 초대 링크로 등록한 기기는 로그인 없이 QR만 찍으면 출퇴근 화면이 열린다.
- [ ] 쿠키가 없는 기기로 QR을 찍으면 미등록 안내가 나온다.
- [ ] 기기 재등록 후 이전 기기로 punch하면 `UNAUTHENTICATED`.
- [ ] DB에 기기 토큰 원문이 없다.
- [ ] 휴대폰 인증 전 `PAYROLL_READ` Manager는 정산·명세서에서 `PHONE_VERIFICATION_REQUIRED`, 대시보드는 금액만 숨는다. 인증하면 같은 기기로 바로 보인다.
- [ ] 기기 쿠키는 `HttpOnly`이고 JS에서 읽을 수 없다.
- [ ] production에서는 `x-dev-user-id`·`dev_user_id`가 무시된다.
