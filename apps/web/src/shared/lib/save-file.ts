import type { WebToAppMessage } from '@chulgeunkok/app-bridge';

import { postToApp } from './app-shell';

export type SaveFileMime = Extract<WebToAppMessage, { type: 'SAVE_FILE' }>['mime'];

/** 앱이 경로로 쓰지 않게 구분자·제어 문자를 바꾼다 (app-bridge SAVE_FILE 파일 이름 규칙) */
const UNSAFE_FILE_NAME_CHARS = /[\\/\u0000-\u001f]/g;
/** 클릭 직후 바로 풀면 Safari 가 받기를 놓친다 */
const OBJECT_URL_REVOKE_DELAY_MS = 1000;

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).slice(String(reader.result).indexOf(',') + 1));
    reader.onerror = () => reject(reader.error ?? new Error('파일을 읽지 못했어요'));
    reader.readAsDataURL(blob);
  });
}

function downloadWithAnchor(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), OBJECT_URL_REVOKE_DELAY_MS);
}

/**
 * 파일 받기. 브라우저는 `<a download>`, 앱 WebView 는 blob:·data: 다운로드가 안 되니
 * base64 로 앱에 넘겨 공유 시트로 저장한다 (app-bridge `SAVE_FILE`, docs/specs/qr-card §5.5)
 */
export async function saveFile(blob: Blob, rawFileName: string, mime: SaveFileMime): Promise<void> {
  const fileName = rawFileName.replace(UNSAFE_FILE_NAME_CHARS, '_');
  if (!window.ReactNativeWebView) return downloadWithAnchor(blob, fileName);
  postToApp({ type: 'SAVE_FILE', fileName, mime, base64: await blobToBase64(blob) });
}
