<p align="center">
  <img src="docs/readme/hero.png" width="100%" alt="출근콕. QR 기반 소규모 매장 근태관리 SaaS. 스티커 하나로 찍는 출퇴근" />
</p>

<p align="center">
  <img src="docs/readme/01-qr-clock-in.png" width="100%" alt="01 QR 출퇴근. QR 찍고 버튼 하나" />
</p>

<p align="center">
  <img src="docs/readme/02-live-status.png" width="100%" alt="02 실시간 근무 현황. 지금 누가 일하는지 한눈에" />
</p>

<p align="center">
  <img src="docs/readme/03-payroll.png" width="100%" alt="03 근무시간 집계와 월말 정산. 월말 정산은 CSV 한 번" />
</p>

<p align="center">
  <img src="docs/readme/04-allowances.png" width="100%" alt="04 예상 기본급, 주휴수당, 가산수당. 기본급 따로, 수당 따로" />
</p>

<p align="center">
  <img src="docs/readme/05-labor-guide.png" width="100%" alt="05 노무 의무 안내. 놓치기 쉬운 노무 의무를 먼저" />
</p>

## 앱 푸시 (FCM)

환경 변수 `GOOGLE_SERVICES_JSON`(Android `google-services.json` 경로), `GOOGLE_SERVICE_INFO_PLIST`(iOS `GoogleService-Info.plist` 경로)를 주면 Firebase 플러그인이 켜진다. 없으면 푸시 없이 기존처럼 동작한다.
개발 빌드: `cd apps/mobile && GOOGLE_SERVICES_JSON=./google-services.json GOOGLE_SERVICE_INFO_PLIST=./GoogleService-Info.plist npx expo prebuild --clean`
실행: `WEB_ORIGIN=http://<PC LAN IP>:3020 npx expo run:android` (또는 `run:ios`). Expo Go 에서는 푸시가 꺼진다. 두 파일은 `.gitignore` 대상이다.
