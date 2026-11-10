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

Next.js 15 · React 19 · TypeScript · Expo · Prisma · PostgreSQL
