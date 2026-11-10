import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * app.json 위에 실행 환경 값만 덮어쓴다.
 * 실기기에서는 휴대폰의 localhost 가 PC 가 아니라서 `WEB_ORIGIN=http://<PC LAN IP>:3020` 으로 띄운다 (README 앱 절)
 */
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  extra: {
    ...config.extra,
    webOrigin: process.env.WEB_ORIGIN ?? config.extra?.webOrigin,
  },
});
