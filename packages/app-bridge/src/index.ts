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

/** 푸시 알림을 눌러 열 수 있는 경로: 내 근무, 내 임금명세서 상세 (docs/specs/payslip §6) */
const PUSH_PATH_PATTERN = /^\/me(\/payslips\/[A-Za-z0-9_-]+)?$/;

/** 위치 요청 ↔ 응답을 짝짓는 값 (웹이 만든 UUID 등) */
const RequestId = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);

/** 앱이 받아 저장할 파일 base64 상한. 300dpi 스탠드 PDF·PNG(수백 KB)보다 넉넉하다 (docs/specs/qr-card §5) */
export const SAVE_FILE_MAX_BASE64_LENGTH = 8 * 1024 * 1024;
const SAVE_FILE_NAME_MAX = 120;
/** 경로 구분자·제어 문자 없는 파일 이름. 앱 캐시 폴더 밖으로 나가지 않게 한다 */
const SaveFileName = z
  .string()
  .min(1)
  .max(SAVE_FILE_NAME_MAX)
  .regex(/^[^\\/\u0000-\u001f]+$/)
  .refine((name) => name !== '.' && name !== '..');

export const WebToAppMessage = z.discriminatedUnion('type', [
  /** 웹 화면의 "QR 찍기" */
  z.object({ type: z.literal('OPEN_SCANNER') }),
  /**
   * 초대 수락·휴대폰 인증 직후. 웹이 받은 1회용 교환 코드를 넘기면 앱이 자기 기기 토큰으로 바꿔 보안 저장소에 둔다.
   * 토큰 자체는 JS에 노출하지 않는다 (docs/specs/auth §6.2)
   */
  z.object({ type: z.literal('DEVICE_REGISTERED'), handoffCode: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }),
  /**
   * 출퇴근 위치. 앱 안에서는 WebView geolocation 대신 앱이 네이티브로 받아 `LOCATION` 으로 답한다
   * (iOS 가 앱 권한 + 사이트 권한을 두 번 묻지 않게)
   */
  z.object({ type: z.literal('REQUEST_LOCATION'), requestId: RequestId }),
  /**
   * 파일 저장. WebView 는 blob:·data: 다운로드를 못 하므로 웹이 base64 로 넘기고 앱이 공유 시트로 연다 (docs/specs/qr-card §5.5)
   */
  z.object({
    type: z.literal('SAVE_FILE'),
    fileName: SaveFileName,
    mime: z.enum(['application/pdf', 'image/png']),
    base64: z.string().min(1).max(SAVE_FILE_MAX_BASE64_LENGTH).regex(/^[A-Za-z0-9+/]+={0,2}$/),
  }),
]);
export type WebToAppMessage = z.infer<typeof WebToAppMessage>;

/** 좌표·실패 사유 둘 다 `LOCATION` 이라 discriminatedUnion 대신 union 으로 받는다 */
export const AppToWebMessage = z.union([
  /** 스캔한 QR이 앱 경로가 아니었을 때 웹이 안내를 띄운다 */
  z.object({ type: z.literal('SCAN_REJECTED') }),
  /** `REQUEST_LOCATION` 응답 — 좌표 */
  z.object({
    type: z.literal('LOCATION'),
    requestId: RequestId,
    coords: z.object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      accuracy: z.number().nonnegative(),
    }),
  }),
  /** `REQUEST_LOCATION` 응답 — 권한 거부(DENIED) 또는 못 받음(UNAVAILABLE) */
  z.object({ type: z.literal('LOCATION'), requestId: RequestId, error: z.enum(['DENIED', 'UNAVAILABLE']) }),
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

/** 앱 → 웹 메시지 검증. WebView `postMessage` 는 문자열로 오므로 JSON 문자열도 받는다 */
export function parseAppToWeb(raw: unknown): AppToWebMessage | null {
  try {
    const parsed = AppToWebMessage.safeParse(typeof raw === 'string' ? JSON.parse(raw) : raw);
    return parsed.success ? parsed.data : null;
  } catch {
    // JSON이 아닌 메시지는 이 계약 밖이다 (다른 스크립트의 postMessage)
    return null;
  }
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

/** 푸시 data.path → 앱이 열어도 되는 경로. 그 밖(외부 주소·API·`..`)은 null */
export function toPushPath(raw: unknown): string | null {
  return typeof raw === 'string' && PUSH_PATH_PATTERN.test(raw) ? raw : null;
}
