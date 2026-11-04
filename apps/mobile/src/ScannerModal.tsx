import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { toAppPath } from '@chulgeunkok/app-bridge';

import { WEB_ORIGIN } from './config';

interface ScannerModalProps {
  visible: boolean;
  onClose: () => void;
  /** 출근콕 QR이면 열 경로 (/p/… 또는 /invite/…) */
  onScanned: (path: string) => void;
}

/** 앱 안 QR 스캐너. 출근콕 매장·초대 QR만 받는다 (docs/specs/auth §6.1) */
export default function ScannerModal({ visible, onClose, onScanned }: ScannerModalProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [rejected, setRejected] = useState(false);
  // 같은 QR이 연속으로 잡히는 동안 한 번만 처리한다
  const handled = useRef(false);

  const handleScan = (result: BarcodeScanningResult) => {
    if (handled.current) return;
    const path = toAppPath(result.data, WEB_ORIGIN);
    if (!path) {
      setRejected(true);
      return;
    }
    handled.current = true;
    onScanned(path);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onShow={() => {
        handled.current = false;
        setRejected(false);
      }}
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {permission?.granted ? (
          <CameraView style={StyleSheet.absoluteFill} barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={handleScan} />
        ) : (
          <View style={styles.center}>
            <Text style={styles.title}>카메라를 허용해 주세요</Text>
            <Text style={styles.body}>매장 QR을 찍어 출퇴근을 기록해요.</Text>
            <Pressable accessibilityRole="button" style={styles.primary} onPress={() => void requestPermission()}>
              <Text style={styles.primaryText}>카메라 허용</Text>
            </Pressable>
          </View>
        )}
        <View style={styles.footer}>
          <Text style={styles.hint}>{rejected ? '출근콕 QR이 아니에요. 매장에 붙은 QR을 찍어 주세요.' : '매장에 붙은 출근콕 QR을 비춰 주세요'}</Text>
          <Pressable accessibilityRole="button" style={styles.secondary} onPress={onClose}>
            <Text style={styles.secondaryText}>닫기</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

/** RN 스타일은 웹 토큰을 쓸 수 없어 필요한 값만 둔다 */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 20, fontWeight: '700', color: '#1a1c20' },
  body: { fontSize: 15, color: '#555d6d' },
  primary: { marginTop: 16, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10, backgroundColor: '#2a2e36' },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  footer: { position: 'absolute', left: 16, right: 16, bottom: 48, gap: 12, alignItems: 'center' },
  hint: { color: '#fff', fontSize: 15, textAlign: 'center', textShadowColor: '#000', textShadowRadius: 4 },
  secondary: { alignSelf: 'stretch', paddingVertical: 14, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.9)', alignItems: 'center' },
  secondaryText: { fontSize: 16, fontWeight: '700', color: '#1a1c20' },
});
