<div align="center">

<img src="apps/mobile/assets/icon.png" width="96" alt="출근콕 앱 아이콘" />

<br /><br />

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/brand/%EC%B6%9C%EA%B7%BC%EC%BD%95-%EC%9B%8C%EB%93%9C%EB%A7%88%ED%81%AC-%ED%99%94%EC%9D%B4%ED%8A%B8.png" />
  <img src="apps/web/public/brand/wordmark.png" width="220" alt="출근콕" />
</picture>

<br /><br />

작은 가게 사장님이 직원 출퇴근과 급여를 챙기는 앱.<br />
매장에 QR 스티커를 붙여 두면 직원이 휴대폰으로 찍고 출근한다.

</div>

## 쓰는 흐름

<table>
<tr>
<td width="34%" align="center"><img src="assets/brand/%EC%B6%9C%EA%B7%BC%EC%BD%95-QR%EC%8A%A4%ED%8B%B0%EC%BB%A4.png" width="200" alt="매장 QR 스티커" /></td>
<td>

1. 사장님이 휴대폰 인증을 하고 가게를 검색해 매장을 만든다. 매장 QR을 뽑아 카운터에 붙인다.
2. 직원은 초대 링크로 자기 휴대폰을 한 번 등록한다. 그 뒤로는 QR을 찍고 버튼 하나만 누른다. 출근해 있으면 퇴근 버튼이 뜬다.
3. 사장님 화면에 오늘 일하는 사람, 이번 달 근무시간과 예상 기본급이 쌓인다. 퇴근을 안 찍었거나 근로조건이 비어 있으면 처리할 일로 올라온다.

</td>
</tr>
</table>

## 직원 화면

<table>
<tr>
<td align="center"><img src="docs/screenshots/employee-qr.png" width="220" alt="QR을 찍고 들어온 출근 화면" /></td>
<td align="center"><img src="docs/screenshots/employee-clock-in.png" width="220" alt="출근 완료 화면" /></td>
<td align="center"><img src="docs/screenshots/employee-my-work.png" width="220" alt="내 근무 기록과 예상 급여" /></td>
</tr>
<tr>
<td align="center">QR 찍고 출근</td>
<td align="center">출근 완료</td>
<td align="center">내 근무와 예상 급여</td>
</tr>
</table>

## 사장님 화면

<table>
<tr>
<td align="center"><img src="docs/screenshots/owner-home.png" width="220" alt="매장 홈" /></td>
<td align="center"><img src="docs/screenshots/owner-attendances.png" width="220" alt="근태 기록" /></td>
<td align="center"><img src="docs/screenshots/owner-payroll.png" width="220" alt="정산" /></td>
</tr>
<tr>
<td align="center">매장 홈</td>
<td align="center">근태 기록</td>
<td align="center">정산과 CSV</td>
</tr>
</table>

## 기능

- QR 출퇴근: 등록한 기기로만 찍힌다. 네트워크가 끊겨 다시 보내도 두 번 기록되지 않는다.
- 근태: 퇴근을 안 찍으면 일정 시간 뒤 퇴근 누락으로 바뀐다. 직원이 수정 요청을 보내면 사장님이 승인한다.
- 정산: 요일별 근무 스케줄과 시급 이력으로 예상 기본급을 계산하고 CSV로 내려받는다.
- 노무 안내: 최저임금, 휴게, 야간·연장, 결근 의심을 확인해야 할 때 알려 준다. 5인 미만 매장은 문구를 달리한다.
- 앱: Expo 앱이 웹 화면을 WebView로 띄우고, QR 스캔과 기기 토큰 저장을 맡는다.

법령 해석은 설계 단계의 가정이라 출시 전에 공인노무사 검토를 받는다.

## 기술

Next.js 15 · React 19 · TypeScript · Expo · Prisma · PostgreSQL · Zod · Vitest

```
apps/web             Next.js. 화면과 /api/v1
apps/mobile          Expo 셸. WebView, QR 스캐너, 기기 토큰 보관
packages/db          Prisma 스키마, 마이그레이션, 테스트용 PGlite DB
packages/app-bridge  웹과 앱이 주고받는 메시지 스키마
```

### 앱은 WebView 셸로 만들었다

- 화면은 전부 Next.js로 만들고 Expo 앱이 WebView로 띄운다. 화면 전환은 직접 만든 [WebViewKit](https://www.npmjs.com/package/@ahnseungchan/webviewkit)으로 네이티브 스택처럼 넘긴다.
- 웹과 앱은 `packages/app-bridge`의 Zod 스키마 하나를 같이 쓰고, 메시지를 받는 쪽에서 매번 검증한다. 앱은 `/p/…`, `/invite/…` 경로만 열고 나머지 URL은 무시한다.
- 기기 토큰은 JS에 넘기지 않는다. 웹이 60초짜리 일회용 코드를 앱에 주면 앱이 그 코드를 토큰으로 바꿔 Keychain·Keystore에 둔다.
- 위치는 WebView geolocation 대신 앱이 네이티브로 받아 웹에 넘긴다. iOS가 앱 권한과 사이트 권한을 두 번 묻지 않게 하려고.

### 출퇴근은 서버가 정한다

- 직원이 출근/퇴근을 고르지 않는다. 서버가 열린 근무가 있는지 보고 다음 동작을 정해서 잘못 누를 수가 없다.
- 찍기 요청에는 `Idempotency-Key` 헤더가 필수다. 전파가 약한 매장에서 재시도해도 한 번만 기록된다.
- 근무 시각은 서버가 받은 시각만 쓴다. 휴대폰 시계를 바꿔도 소용없다.

### 규칙은 DB에서도 막는다

- 직원 한 명에게 열린 근무는 하나만 (부분 유니크 인덱스)
- 퇴근 시각은 출근 시각 뒤, 시급은 0보다 크게 (CHECK)
- 같은 직원의 근로조건 기간은 겹칠 수 없음 (`btree_gist` EXCLUDE 제약)

서비스 코드가 놓쳐도 DB가 거절한다. Prisma 스키마로 표현이 안 되는 제약은 SQL 마이그레이션으로 따로 뒀다.

### 정산과 노무 계산

- 근무시간·급여 계산은 순수 함수로 분리해 테스트한다. 초 단위 정수로 계산하고, 직원별 정산 기간 합계에서 원 미만을 한 번만 올린다.
- 최저임금 같은 기준은 연도별 규칙(`LaborRuleSet`)으로 DB에 넣었다. 검토 안내에는 사유 코드와 규칙 버전을 남겨서 같은 안내가 반복해서 뜨지 않는다.
- 퇴근 누락 전환(10분마다)과 결근·야간·연장 재평가(매일 06:00)는 외부 스케줄러가 부르는 배치 API다.

### 테스트

- Vitest 테스트 파일 46개. DB가 걸린 서비스 테스트는 PGlite(Node에서 도는 Postgres) 위에 실제 마이그레이션을 올려서 제약까지 같이 확인한다.
- 로컬 개발도 Postgres 설치 없이 PGlite 파일 DB로 돌아간다. 데모 매장·직원·QR이 같이 들어간다.
