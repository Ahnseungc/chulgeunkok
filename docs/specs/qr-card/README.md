# QR 카드 셀프 제작 — 기능 스펙

| 항목 | 값 |
| --- | --- |
| 상태 | **Draft** (2026-11-12) |
| PRD | §3.1 매장 QR, store §5 |
| 인덱스 | [../README.md](../README.md) |

---

## 1. 개요

1. 사장님이 앱에서 매장 출퇴근 QR 카드를 직접 디자인하고, PDF·PNG로 받아 프린트하거나 태블릿에 띄운다. 포스기 옆에 두는 것을 기본 장면으로 본다.
2. 디자인은 한 화면에서 고른다: 위에 미리보기, 아래에 **레이아웃 · 색 · 문구 · 로고**. 바꾸면 미리보기에 바로 반영된다.
3. 디자인은 매장마다 1개 저장되고, 언제 다시 들어와도 그대로 열린다.
4. 언제든 다시 뽑을 수 있도록 매장 QR 원문을 **암호화해서 저장**한다 (store §5.3 대안을 도입).
5. 태블릿용 전용 화면은 없다. 받은 이미지를 띄우면 된다.

## 2. 범위 / 비목표

| 포함 | 제외 |
| --- | --- |
| 레이아웃 2종: 탁상 스탠드(A6 세로), 스티커(80×80mm) | 실물 주문(QR·NFC 스티커, 카드형), 결제, 관리자 화면 — 다음 작업 |
| 색 프리셋, 매장 이름·안내 문구 수정, 로고 올리기 | 아무 색이나 고르는 색상 선택기 |
| 프린트용 PDF, 고해상도 PNG 받기 | 태블릿 전용 화면·시계, 키오스크(동적 QR+PIN) |
| QR 원문 암호화 저장, 사장님만 복호화 조회 | NFC 태그 쓰기 화면 변경 |
| 디자인 저장(매장당 1개) | 디자인 여러 개 보관 |

## 3. QR 원문 암호화 저장

### 3.1 저장

- `StoreQrToken`에 `tokenCiphertext String?` 를 추가한다. 형식: `v1.<iv base64url>.<ciphertext+tag base64url>` (AES-256-GCM, iv 12바이트).
- 키: 서버 환경 변수 `QR_TOKEN_ENC_KEY` (32바이트 base64). 접두사 `v1`은 키 버전이다 — 키를 바꿀 때 `v2`를 추가하고 둘 다 읽는다.
- 발급(매장 생성)·재발급(store §5.2) 때 원문으로 `tokenHash`와 `tokenCiphertext`를 같이 쓴다. 출퇴근 판정은 지금처럼 `tokenHash`만 쓴다.
- production에서 키가 없으면 발급을 실패시킨다(`INTERNAL`). 개발 환경은 고정 개발 키로 대신한다 (`assertDevFallbackAllowed` 패턴).

### 3.2 조회

`GET /stores/:storeId/qr` → `{ url: string | null, issuedAt }` — **Owner만** (`STORE_ADMIN`).

- 활성 토큰의 `tokenCiphertext`를 풀어 `https://<도메인>/p/<원문>` 을 준다.
- 이 기능 이전에 만든 토큰은 암호문이 없어 `url: null`. 화면은 "QR을 새로 만들어야 카드를 만들 수 있어요" + 재발급 버튼을 보인다 (출시 전이라 기존 매장은 한 번 재발급).
- 응답은 `Cache-Control: no-store`.

### 3.3 store §5 변경

- §5.1 표에 `암호문` 줄 추가, §5.3 "원문 재조회"를 "Owner는 §3.2로 다시 볼 수 있다"로 바꾼다.
- §5.4 출력: 생성·재발급 직후 화면에 "QR 카드 만들기" 링크를 추가한다.

## 4. 디자인

### 4.1 모델

```prisma
enum QrCardLayout {
  STAND    // 탁상 스탠드 A6 세로 (105×148mm)
  STICKER  // 스티커 80×80mm
}

model StoreQrDesign {
  storeId     String       @id
  layout      QrCardLayout @default(STAND)
  color       String       @default("kok") // 프리셋 키 (§4.2)
  title       String       // 기본: 매장 이름. 1~20자
  message     String       // 기본 안내 문구. 0~40자
  logo        Bytes?       // PNG/JPEG, 200KB 이하 (§4.3)
  logoMime    String?
  updatedById String
  updatedAt   DateTime     @updatedAt @db.Timestamptz(3)

  store Store @relation(fields: [storeId], references: [id], onDelete: Cascade)
}
```

- 저장하지 않은 매장은 기본값으로 연다: `layout STAND`, `color kok`, `title = 매장 이름`, `message = "휴대폰 카메라로 찍고 출근·퇴근 버튼을 눌러 주세요"`.
- 스티커 레이아웃은 `message`를 그리지 않는다 (작은 크기, §4.4).

### 4.2 색 프리셋

QR이 잘 읽히도록 QR 자체는 항상 흰 바탕 위 검정이고, 프리셋은 카드 배경·강조색만 바꾼다.

| 키 | 이름 | 카드 배경 | 강조(뱃지·글자) |
| --- | --- | --- | --- |
| `kok` | 출근콕 빨강 | 흰색 | 브랜드 빨강 (`--color-brand-kok`) |
| `kokFill` | 빨강 채움 | 브랜드 빨강 | 흰색 |
| `white` | 흰색 | 흰색 | 검정 |
| `black` | 검정 | 검정 | 흰색 |
| `blue` | 파랑 | 흰색 | 파랑 |
| `green` | 초록 | 흰색 | 초록 |

값은 `features/qr-card/model/qr-card-colors.ts` 한 곳에 두고 미리보기·PDF·PNG가 같이 쓴다. 정확한 파랑·초록 값은 빌더 재량(디자인 토큰에 있으면 그것).

### 4.3 로고

- 선택. PNG·JPEG만. 클라이언트에서 긴 변 512px로 줄여 PNG로 올린다. 디코드 200KB를 넘으면(사진 로고) 흰 바탕 JPEG 품질 0.9 → 0.6, 그래도 크면 긴 변 384px로 다시 줄여 올린다. 어떻게 해도 크면 화면에서 "로고가 너무 커요" 안내. 서버는 MIME·크기(200KB) 검사 후 저장, 넘으면 `QR_LOGO_TOO_LARGE`.
- 로고가 있으면 카드 위쪽에 매장 이름 대신이 아니라 **함께** 그린다 (로고 위, 이름 아래). 삭제 가능.
- `GET /stores/:storeId/qr-design/logo` 로 이미지를 준다 (Owner만).

### 4.4 레이아웃 내용

| 요소 | 스탠드(A6) | 스티커(80×80) |
| --- | --- | --- |
| 로고 | ○ (있으면) | ○ (있으면, 작게) |
| `title` | ○ | ○ (한 줄) |
| "직원 출퇴근" 뱃지 | ○ | ○ |
| `message` | ○ | — |
| QR | 큰 QR | QR |
| 출근콕 워드마크 | 아래 작게 | — |

QR 최소 크기: 스탠드 60mm, 스티커 50mm. 오류 정정 레벨 M 이상.

## 5. 화면 `/owner/[storeId]/qr-card`

1. 진입: 매장 설정 QR 영역의 "QR 카드 만들기", 매장 생성·재발급 직후 화면의 링크. Owner만 보인다.
2. 위: 미리보기 (실제 비율, 화면 폭에 맞춤).
3. 아래: 레이아웃(스탠드/스티커) · 색(프리셋 동그라미) · 매장 이름 · 안내 문구(스탠드만) · 로고 올리기/지우기.
4. 바꾸면 미리보기에 바로 반영. 저장은 자동(입력 멈춘 뒤 저장, 실패 시 오류 표시) — 정확한 방식은 빌더 재량.
5. 하단 CTA: "PDF 받기" · "이미지 받기".
   - PDF: 실제 크기(A6 또는 80×80mm) 한 장. 인쇄 시 "실제 크기"로 찍도록 안내 한 줄.
   - PNG: 300dpi 기준 해상도 (A6 ≈ 1240×1748px, 스티커 ≈ 945×945px).
   - 파일은 클라이언트에서 만든다 (QR은 기존 `qrcode` 라이브러리, PDF는 빌더 재량 — 가벼운 클라이언트 라이브러리).
   - 브라우저는 `<a download>` 로 받는다. 앱 WebView 는 blob:·data: 다운로드가 안 되므로 base64 를 `SAVE_FILE`(auth §6.3)로 넘기고 앱이 공유 시트(파일·사진 저장·인쇄)를 연다.
6. 암호문이 없으면(§3.2) 미리보기 자리에 재발급 안내.
7. 재발급 버튼 근처에 store §5.2 경고 문구를 유지한다.

## 6. API

| Method | 경로 | 권한 |
| --- | --- | --- |
| GET | `/stores/:storeId/qr` | Owner |
| GET | `/stores/:storeId/qr-design` | Owner (없으면 기본값) |
| PUT | `/stores/:storeId/qr-design` body `{ layout, color, title, message }` | Owner |
| PUT | `/stores/:storeId/qr-design/logo` body `{ dataUrl }` | Owner |
| DELETE | `/stores/:storeId/qr-design/logo` | Owner |
| GET | `/stores/:storeId/qr-design/logo` | Owner |

## 7. 에러 코드

| code | HTTP | 메시지 |
| --- | --- | --- |
| `QR_LOGO_TOO_LARGE` | 400 | 로고 파일이 너무 커요. 200KB 이하로 올려 주세요. |
| `QR_LOGO_INVALID` | 400 | PNG나 JPG 이미지만 올릴 수 있어요. |

`color`가 프리셋 키가 아니거나 글자 수를 넘으면 `VALIDATION_FAILED`.

## 8. 세부 결정

| 항목 | 결정 |
| --- | --- |
| URL 도메인 | 기존 발급·재발급과 같은 `process.env.APP_ORIGIN ?? req.nextUrl.origin` 으로 조립한다 (NFC 쓰기 주소와 같다) |
| 재발급과 디자인 | 재발급은 QR 원문만 바꾸고 `StoreQrDesign`은 그대로 둔다 |
| 기존 토큰 | 마이그레이션은 컬럼만 추가한다. 원문을 모르므로 backfill 하지 않고 §3.2 `url: null` 경로로 재발급을 안내한다 (개발 시드도 같다) |
| 로고 200KB | 디코드한 바이너리 기준. dataUrl 본문은 약 280KB까지 받는다 |
| 로고 형식 검사 | dataUrl 헤더가 아니라 **매직바이트**로 PNG·JPEG를 판별한다 |
| `updatedById` | 세션 사용자 |
| `title` | 처음 저장할 때의 값으로 고정. 매장 이름이 바뀌어도 카드 제목은 따라가지 않는다 (사장님이 직접 고친다) |
| 자동 저장 중 받기 | 저장 완료를 기다리지 않고 화면의 현재 값으로 파일을 만든다 |
| PDF·PNG 렌더링 | 카드를 캔버스로 그려 PNG를 만들고, PDF는 그 PNG를 실제 크기로 넣는다 (한글 폰트 임베딩 불필요). 워드마크는 이미 있는 `apps/web/public/brand/wordmark.png` 를 쓴다 |

## 9. 수용 기준

- [ ] 매장 생성·재발급 뒤 DB에 `tokenCiphertext`가 있고, `GET /qr`가 같은 원문 URL을 돌려준다. DB 어디에도 원문 평문은 없다.
- [ ] 재발급하면 `GET /qr`가 새 URL을 주고, 이전 토큰 punch는 `QR_TOKEN_REVOKED` (기존 동작 유지).
- [ ] Manager·Employee는 `GET /qr`·디자인 API 모두 `FORBIDDEN`.
- [ ] 암호문이 없는 기존 토큰은 `url: null`, 화면에 재발급 안내.
- [ ] 레이아웃·색·문구를 바꾸면 미리보기가 바로 바뀌고, 다시 들어와도 그대로다.
- [ ] 로고 200KB 초과는 `QR_LOGO_TOO_LARGE`, GIF는 `QR_LOGO_INVALID`.
- [ ] 받은 PDF를 실제 크기로 인쇄하면 A6(105×148mm)·80×80mm이고 QR이 휴대폰 카메라로 읽힌다.
- [ ] 스티커 레이아웃에는 안내 문구가 없다.
- [ ] 키(`QR_TOKEN_ENC_KEY`)가 없는 production에서 발급은 `INTERNAL`로 실패한다.
