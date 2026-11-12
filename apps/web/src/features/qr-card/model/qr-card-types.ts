/** QR 카드 공용 타입·상수. 정본: docs/specs/qr-card §4 */

export const QR_CARD_DEFAULT_MESSAGE = '휴대폰 카메라로 찍고 출근·퇴근 버튼을 눌러 주세요';
export const QR_CARD_TITLE_MAX = 20;
export const QR_CARD_MESSAGE_MAX = 40;
/** 디코드한 로고 바이너리 상한 (§4.3, §8) */
export const QR_LOGO_MAX_BYTES = 200 * 1024;

export const QR_CARD_COLOR_KEYS = ['kok', 'kokFill', 'white', 'black', 'blue', 'green'] as const;
export type QrCardColorKey = (typeof QR_CARD_COLOR_KEYS)[number];

export const QR_CARD_LAYOUTS = ['STAND', 'STICKER'] as const;
export type QrCardLayoutKey = (typeof QR_CARD_LAYOUTS)[number];

export interface QrCardDesignDto {
  layout: QrCardLayoutKey;
  color: QrCardColorKey;
  title: string;
  message: string;
  hasLogo: boolean;
  /** 지금 매장 이름. 받는 파일 이름에 쓴다 (§5). title 과 달리 매장 이름을 따라간다 */
  storeName: string;
  /** 저장된 행이 있으면 true. 없으면 기본값 */
  saved: boolean;
}
