import { z } from 'zod';

import { QR_CARD_COLOR_KEYS, QR_CARD_LAYOUTS, QR_CARD_MESSAGE_MAX, QR_CARD_TITLE_MAX } from './model/qr-card-types';

/** docs/specs/qr-card §6 */
export const SaveQrDesignBody = z.object({
  layout: z.enum(QR_CARD_LAYOUTS),
  color: z.enum(QR_CARD_COLOR_KEYS),
  title: z.string().trim().min(1).max(QR_CARD_TITLE_MAX),
  message: z.string().trim().max(QR_CARD_MESSAGE_MAX),
});
export type SaveQrDesignBody = z.infer<typeof SaveQrDesignBody>;

/** dataUrl 본문은 디코드 200KB 기준 약 280KB까지 받는다 (§8). 정확한 크기 검사는 서버 로직이 한다 */
const DATA_URL_MAX_LENGTH = 280 * 1024;

export const SaveQrLogoBody = z.object({ dataUrl: z.string().max(DATA_URL_MAX_LENGTH) });
export type SaveQrLogoBody = z.infer<typeof SaveQrLogoBody>;
