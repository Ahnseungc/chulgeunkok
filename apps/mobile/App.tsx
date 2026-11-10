import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { parseWebToApp, toAppPath, type AppToWebMessage } from '@chulgeunkok/app-bridge';

import { HOME_PATH, WEB_ORIGIN } from './src/config';
import { buildEntryUrl, saveDeviceFromHandoff } from './src/device-session';
import { getNativeLocation } from './src/native-location';
import ScannerModal from './src/ScannerModal';

/**
 * 출근콕 앱 셸. 화면은 웹(WebView), 네이티브는 QR 스캔·위치·기기 토큰 보관·딥링크만 (docs/specs/auth §6)
 */
export default function App() {
  const [uri, setUri] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  // 기본 제네릭(undefined)은 props 가 never 가 되어 ref 를 달 수 없다 (react-native-webview 타입)
  const webViewRef = useRef<WebView<object>>(null);

  /** 앱 → 웹. 웹은 window(iOS)·document(Android) 의 message 이벤트로 받아 parseAppToWeb 으로 검증한다 */
  const postToWeb = useCallback((message: AppToWebMessage) => {
    webViewRef.current?.postMessage(JSON.stringify(message));
  }, []);

  /** 앱 경로로 이동. 저장된 기기 토큰이 있으면 세션을 복원하며 연다 */
  const openPath = useCallback(async (path: string) => {
    setUri(await buildEntryUrl(path));
  }, []);

  // 첫 화면: 앱을 연 딥링크(QR·NFC·초대 링크)가 있으면 그 경로, 없으면 내 근무
  useEffect(() => {
    void (async () => {
      const initialUrl = await Linking.getInitialURL();
      await openPath((initialUrl && toAppPath(initialUrl, WEB_ORIGIN)) ?? HOME_PATH);
    })();
    const subscription = Linking.addEventListener('url', ({ url }) => {
      const path = toAppPath(url, WEB_ORIGIN);
      if (path) void openPath(path);
    });
    return () => subscription.remove();
  }, [openPath]);

  const handleMessage = useCallback(async (event: WebViewMessageEvent) => {
    const message = parseWebToApp(event.nativeEvent.data);
    if (message?.type === 'OPEN_SCANNER') setScannerOpen(true);
    if (message?.type === 'DEVICE_REGISTERED') await saveDeviceFromHandoff(message.handoffCode);
    if (message?.type === 'REQUEST_LOCATION') postToWeb(await getNativeLocation(message.requestId));
  }, [postToWeb]);

  if (!uri) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <WebView
        ref={webViewRef}
        source={{ uri }}
        onMessage={(event) => void handleMessage(event)}
        // 우리 웹만 WebView 안에서 연다. 다른 주소는 시스템 브라우저로 (다른 사이트가 앱 화면처럼 보이지 않게)
        onShouldStartLoadWithRequest={(request) => {
          if (request.url.startsWith(WEB_ORIGIN) || request.url === 'about:blank') return true;
          void Linking.openURL(request.url);
          return false;
        }}
        allowsBackForwardNavigationGestures
        pullToRefreshEnabled
        sharedCookiesEnabled
      />
      <ScannerModal
        visible={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScanned={(path) => {
          setScannerOpen(false);
          void openPath(path);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
});
