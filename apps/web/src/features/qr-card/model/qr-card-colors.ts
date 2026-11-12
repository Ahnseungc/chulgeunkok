/**
 * 색 프리셋 값. 정본: docs/specs/qr-card §4.2
 * 이 파일만 hex를 직접 쓴다: 카드를 캔버스로 그려 PNG·PDF를 만들기 때문에 CSS 변수가 아닌 실제 값이 필요하다.
 * 흰 카드 위 글자 대비(4.5:1 이상): blue = Seed blue-800 #135fcd(5.9), green = Seed green-800 #00745f.
 * kok 은 브랜드 빨강(globals.css --color-brand-kok)이라 대비 3.7:1 이다. 큰 글자·뱃지에만 쓴다.
 */

import type { QrCardColorKey } from './qr-card-types';

export interface QrCardColor {
  label: string;
  background: string;
  accent: string;
  /** 강조색 뱃지 위 글자색 */
  onAccent: string;
  /** 카드 배경 위 본문 글자색 */
  text: string;
}

const BRAND_KOK = '#f04a33';
const WHITE = '#ffffff';
const BLACK = '#111111';

export const QR_CARD_COLORS: Record<QrCardColorKey, QrCardColor> = {
  kok: { label: '출근콕 빨강', background: WHITE, accent: BRAND_KOK, onAccent: WHITE, text: BLACK },
  kokFill: { label: '빨강 채움', background: BRAND_KOK, accent: WHITE, onAccent: BRAND_KOK, text: WHITE },
  white: { label: '흰색', background: WHITE, accent: BLACK, onAccent: WHITE, text: BLACK },
  black: { label: '검정', background: BLACK, accent: WHITE, onAccent: BLACK, text: WHITE },
  blue: { label: '파랑', background: WHITE, accent: '#135fcd', onAccent: WHITE, text: BLACK },
  green: { label: '초록', background: WHITE, accent: '#00745f', onAccent: WHITE, text: BLACK },
};
