/**
 * RN 앱 셸 ↔ 웹(WebView) 계약. 정본: docs/specs/auth §6
 * 웹(apps/web)과 앱(apps/mobile)이 같이 쓴다. 메시지는 받는 쪽에서 항상 검증한다.
 */
import { z } from 'zod';

/** 기기 세션 쿠키 이름 (docs/specs/auth §3.2) */
export const DEVICE_COOKIE = 'ck_device';
/** 앱 커스텀 스킴 (유니버설 링크가 없는 환경·개발용) */
export const APP_SCHEME = 'chulgeunkok';

/** 앱이 열 수 있는 웹 경로. 그 밖의 URL은 무시한다 (임의 사이트를 WebView로 열지 않게) */
const APP_PATH_PATTERN = /^\/(p|invite)\/[A-Za-z0-9_-]{20,64}$/;

export const WebToAppMessage = z.discriminatedUnion('type', [
  /** 웹 화면의 "QR 찍기" */
  z.object({ type: z.literal('OPEN_SCANNER') }),
  /**
   * 초대 수락·휴대폰 인증 직후. 웹이 받은 1회용 교환 코드를 넘기면 앱이 자기 기기 토큰으로 바꿔 보안 저장소에 둔다.
   * 토큰 자체는 JS에 노출하지 않는다 (docs/specs/auth §6.2)
   */
  z.object({ type: z.literal('DEVICE_REGISTERED'), handoffCode: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }),
]);
export type WebToAppMessage = z.infer<typeof WebToAppMessage>;

export const AppToWebMessage = z.discriminatedUnion('type', [
  /** 스캔한 QR이 앱 경로가 아니었을 때 웹이 안내를 띄운다 */
  z.object({ type: z.literal('SCAN_REJECTED') }),
]);
export type AppToWebMessage = z.infer<typeof AppToWebMessage>;

/** 문자열 메시지 → 검증된 메시지. 형식이 틀리면 null (낯선 메시지는 조용히 무시) */
export function parseWebToApp(raw: string): WebToAppMessage | null {
  try {
    const parsed = WebToAppMessage.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    // JSON이 아닌 메시지는 이 계약 밖이다 (다른 스크립트의 postMessage)
    return null;
  }
}

export function parseAppToWeb(raw: unknown): AppToWebMessage | null {
  const parsed = AppToWebMessage.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * QR·NFC·딥링크로 들어온 URL → WebView에서 열 경로. 앱이 다룰 URL이 아니면 null.
 * - `<origin>/p/<토큰>`, `<origin>/invite/<토큰>` (같은 출처만)
 * - `chulgeunkok://p/<토큰>` (커스텀 스킴)
 */
export function toAppPath(rawUrl: string, origin: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  const path = url.protocol === `${APP_SCHEME}:` ? `/${url.host}${url.pathname}` : url.origin === origin ? url.pathname : null;
  return path && APP_PATH_PATTERN.test(path) ? path : null;
}
