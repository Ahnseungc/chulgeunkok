import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * app.json 위에 실행 환경 값만 덮어쓴다.
 * 실기기에서는 휴대폰의 localhost 가 PC 가 아니라서 `WEB_ORIGIN=http://<PC LAN IP>:3020` 으로 띄운다 (README 앱 절)
 * 푸시(FCM)는 Firebase 설정 파일 경로 환경 변수가 있을 때만 켠다 — 없으면 기존 동작 그대로 (README 앱 푸시 절)
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const iosGoogleServices = process.env.GOOGLE_SERVICE_INFO_PLIST;
  const androidGoogleServices = process.env.GOOGLE_SERVICES_JSON;
  const hasFirebase = Boolean(iosGoogleServices || androidGoogleServices);
  const base = config as ExpoConfig;

  return {
    ...base,
    ios: {
      ...base.ios,
      ...(iosGoogleServices ? { googleServicesFile: iosGoogleServices } : {}),
    },
    android: {
      ...base.android,
      permissions: [...(base.android?.permissions ?? []), 'android.permission.POST_NOTIFICATIONS'],
      ...(androidGoogleServices ? { googleServicesFile: androidGoogleServices } : {}),
    },
    plugins: [
      ...(base.plugins ?? []),
      ...(hasFirebase
        ? [
            '@react-native-firebase/app',
            '@react-native-firebase/messaging',
            ['expo-build-properties', { ios: { useFrameworks: 'static' } }] as [string, object],
          ]
        : []),
    ],
    extra: {
      ...config.extra,
      webOrigin: process.env.WEB_ORIGIN ?? config.extra?.webOrigin,
    },
  };
};
