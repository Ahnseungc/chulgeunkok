import Constants from 'expo-constants';

/** 웹 서버 출처. app.json `extra.webOrigin` (배포 시 실제 도메인으로 바꾼다) */
export const WEB_ORIGIN: string =
  (Constants.expoConfig?.extra?.webOrigin as string | undefined) ?? 'http://localhost:3020';

/** 앱을 열면 보여 줄 첫 화면 (직원 내 근무) */
export const HOME_PATH = '/me';
