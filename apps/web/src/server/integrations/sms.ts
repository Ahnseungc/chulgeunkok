import { assertDevFallbackAllowed } from './dev-fallback';

/** SMS 발송. 공급자 계약 후 구현을 추가한다 (docs/specs/auth §4.1, 인덱스 Q2) */
export interface SmsSender {
  /** dev 발송기면 true. 응답에 개발용 코드를 실어도 되는지 판단한다 */
  readonly isDev: boolean;
  send(phone: string, text: string): Promise<void>;
}

const devSmsSender: SmsSender = {
  isDev: true,
  async send(phone, text) {
    assertDevFallbackAllowed('SMS_PROVIDER');
    console.info(`[sms:dev] ${phone} ← ${text}`);
  },
};

/**
 * ponytail: 지금은 dev 발송기 하나. 공급자(솔라피 등)를 정하면 SMS_PROVIDER 값으로 분기를 추가한다.
 */
export function getSmsSender(): SmsSender {
  return devSmsSender;
}
