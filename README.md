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

## 만든 사람과 범위

1인 사이드 프로젝트 (2026.11 ~ 진행 중). 기획서(PRD), 기능 스펙, 웹 화면, API, DB, 모바일 앱까지 혼자 만들고 있다.

Next.js 15 · React 19 · TypeScript · Expo · Prisma · PostgreSQL · Zod · Vitest · Seed Design

```
apps/web             Next.js. 화면과 /api/v1
apps/mobile          Expo 셸. WebView, QR 스캐너, 기기 토큰 보관
packages/db          Prisma 스키마, 마이그레이션, 테스트용 PGlite DB
packages/app-bridge  웹과 앱이 주고받는 메시지 스키마
```

## 만들면서 고민한 것

### 1. 혼자서 iOS·Android·웹을 어떻게 같이 굴릴까

**문제** 사장님은 PC와 휴대폰을, 직원은 휴대폰만 쓴다. 혼자서 화면을 플랫폼마다 따로 만들면 기능 하나 고칠 때마다 세 번 손이 간다.

**선택** 화면은 전부 Next.js로 만들고, Expo 앱은 WebView로 그 화면을 띄우는 셸로 뒀다. 카메라(QR 스캔), 보안 저장소, 위치처럼 네이티브가 꼭 필요한 일만 앱이 맡는다. WebView 화면 전환이 웹페이지처럼 보이는 문제는 직접 만들어 npm에 올린 [WebViewKit](https://www.npmjs.com/package/@ahnseungchan/webviewkit)을 붙여 iOS식 push/back으로 바꿨다.

**결과** 화면 코드는 한 벌이다. 화면을 고치면 스토어 심사 없이 웹 배포만으로 앱에도 반영된다.

### 2. WebView와 앱 사이를 어떻게 안전하게 이을까

**문제** 브릿지 메시지는 문자열이라 형식이 어긋나도 런타임에야 터진다. 출퇴근 앱의 기기 토큰이 웹 JS에 노출되면 다른 사람이 대신 찍을 수 있다.

**선택**
- 웹과 앱이 같이 import 하는 `packages/app-bridge`에 메시지를 Zod 스키마로 정의하고, 받는 쪽에서 매번 검증한다.
- 앱은 `/p/…`(QR), `/invite/…`(초대) 경로만 연다. 스캔한 QR이 다른 주소면 열지 않는다.
- 기기 토큰은 웹에 주지 않는다. 웹은 60초짜리 일회용 코드만 앱에 넘기고, 앱이 그 코드를 토큰으로 바꿔 Keychain·Keystore에 둔다.
- 위치는 앱이 네이티브로 받아 웹에 넘긴다. 그래서 iOS가 앱 권한과 사이트 권한을 두 번 묻지 않는다.

### 3. 출퇴근 기록을 어떻게 믿을 수 있게 할까

**문제** 근태 기록은 곧 급여라서 틀리면 사장님과 직원이 다툰다. 실제로 생기는 일은 출근 버튼 대신 퇴근 버튼 누르기, 전파 약한 매장에서 두 번 전송, 휴대폰 시계 바꾸기다.

**선택**
- 출근/퇴근 버튼을 따로 두지 않았다. 서버가 열린 근무가 있는지 보고 다음 동작을 정한다.
- 찍기 요청에 `Idempotency-Key`를 필수로 받아, 같은 요청이 두 번 와도 한 번만 기록한다.
- 시각은 서버가 받은 시각만 쓴다.
- 서비스 코드가 놓쳐도 DB가 거절하게 제약을 걸었다. 직원당 열린 근무는 하나(부분 유니크 인덱스), 퇴근은 출근 뒤(CHECK), 근로조건 기간 겹침 금지(`btree_gist` EXCLUDE). Prisma 스키마로 표현이 안 돼서 SQL 마이그레이션으로 따로 썼다.

**검증** DB가 걸린 테스트는 PGlite(Node에서 도는 Postgres)에 실제 마이그레이션을 올려 돌린다. 제약이 정말 막는지까지 테스트로 확인한다.

### 4. 급여와 노무 안내를 어떻게 정확하게, 덜 시끄럽게 할까

**문제** 시급은 중간에 바뀌고, 근무시간을 건마다 반올림하면 월말 합계가 몇십 원씩 어긋난다. 노무 안내는 같은 경고가 매일 뜨면 아무도 안 본다.

**선택**
- 시급과 요일별 근무 스케줄을 근로조건 버전으로 묶었다. 근무 시점의 버전으로 계산한다.
- 초 단위 정수로 계산하고, 직원별 정산 기간 합계에서 원 미만을 한 번만 올린다. 계산은 DB와 분리한 순수 함수라 테스트하기 쉽다.
- 최저임금 같은 기준은 연도별 규칙으로 DB에 넣었다. 안내에는 사유 코드와 규칙 버전을 키로 남겨서 같은 안내를 다시 띄우지 않는다. 5인 미만 매장에는 적용되지 않는 조항이 있어 안내 문구를 다르게 보여 준다.

### 5. 코드 전에 문서

PRD를 v0.4까지 고치면서 리뷰에서 나온 지적 15건을 반영했고, 그걸 도메인별 기능 스펙 7개(인증, 매장, 직원, 노무, 출퇴근, 정산, 대시보드)로 나눴다. API 시그니처, 상태 전이, 계산 규칙, 에러 코드는 스펙을 기준으로 삼고 코드는 거기에 맞춘다.
