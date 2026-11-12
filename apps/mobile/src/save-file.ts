import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import type { WebToAppMessage } from '@chulgeunkok/app-bridge';

type SaveFileMessage = Extract<WebToAppMessage, { type: 'SAVE_FILE' }>;

/**
 * 웹이 만든 파일(QR 카드 PDF·PNG)을 앱 캐시에 쓰고 공유 시트를 연다. 사용자가 파일·사진 저장·인쇄를 고른다.
 * WebView 는 blob:·data: 다운로드를 못 해서 이 경로를 쓴다 (docs/specs/qr-card §5.5).
 * 실패는 throw 하지 않는다 — 앱이 멈추지 않게 경고만 남긴다.
 */
export async function saveSharedFile({ fileName, mime, base64 }: SaveFileMessage): Promise<void> {
  try {
    if (!(await Sharing.isAvailableAsync())) {
      console.warn('[save-file] 이 기기에서는 공유 시트를 열 수 없음');
      return;
    }
    // fileName 은 app-bridge 가 경로 구분자 없는 이름만 통과시킨다
    const file = new File(Paths.cache, fileName);
    await file.write(base64, { encoding: 'base64' });
    await Sharing.shareAsync(file.uri, { mimeType: mime, dialogTitle: fileName });
  } catch (error) {
    console.warn('[save-file] 파일을 저장하지 못함', error);
  }
}
