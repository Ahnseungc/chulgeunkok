/**
 * QR 카드를 캔버스에 그린다. 정본: docs/specs/qr-card §4.2, §4.4, §8
 * 배치는 planQrCardLayout(mm)이 정하고, 여기서는 mm→px 배율(pixelWidth / 카드 폭)로 그대로 그리기만 한다.
 * 작은 글자(제목·문구)는 프리셋 text 색, 강조색은 뱃지 바탕에만 쓴다 (kok 빨강은 흰 바탕 대비 3.7:1).
 */

import QRCode from 'qrcode';

import { QR_CARD_COLORS, QR_CARD_WHITE_BOX, QR_CODE_DARK, type QrCardColor } from '../model/qr-card-colors';
import {
  fitLogo,
  planQrCardLayout,
  QR_CARD_BADGE_TEXT,
  QR_CARD_SIZE_MM,
  WORDMARK_PLATE_PADDING_MM,
  type QrCardBadgeBox,
  type QrCardBox,
  type QrCardTextBox,
} from '../model/qr-card-layout';
import type { QrCardDesignDto } from '../model/qr-card-types';

/** 앱 기본 폰트 (apps/web/src/app/globals.css) */
const FONT_FAMILY = "'Pretendard Variable', system-ui, -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif";
const FONT_BOLD = 700;
const FONT_MEDIUM = 500;
const FONT_PROBE_PX = 16;
const QR_FRAME_RADIUS_MM = 1.5;
const WORDMARK_PLATE_RADIUS_MM = 1;

export interface RenderQrCardInput {
  design: QrCardDesignDto;
  qrUrl: string;
  logo: HTMLImageElement | null;
  wordmark: HTMLImageElement | null;
  pixelWidth: number;
}

interface Painter {
  ctx: CanvasRenderingContext2D;
  px: (mm: number) => number;
}

const fontOf = (weight: number, sizePx: number) => `${weight} ${sizePx}px ${FONT_FAMILY}`;
const naturalSize = (image: HTMLImageElement) => ({ width: image.naturalWidth, height: image.naturalHeight });

/** 한글 subset 폰트라 실제로 그릴 글자로 불러 둔다 */
async function loadFonts(sample: string): Promise<void> {
  await Promise.all(
    [FONT_BOLD, FONT_MEDIUM].map((weight) => document.fonts.load(fontOf(weight, FONT_PROBE_PX), sample)),
  );
}

function roundedRect({ ctx, px }: Painter, box: QrCardBox, radiusMm: number): void {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(px(box.x), px(box.y), px(box.width), px(box.height), px(radiusMm));
  else ctx.rect(px(box.x), px(box.y), px(box.width), px(box.height));
  ctx.fill();
}

function drawTextLines(painter: Painter, text: QrCardTextBox, style: { color: string; weight: number }): void {
  const { ctx, px } = painter;
  ctx.fillStyle = style.color;
  ctx.font = fontOf(style.weight, px(text.fontSizeMm));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const centerX = px(text.x + text.width / 2);
  text.lines.forEach((line, index) => {
    ctx.fillText(line, centerX, px(text.y + text.lineHeightMm * (index + 0.5)));
  });
}

function drawBadge(painter: Painter, badge: QrCardBadgeBox, colors: QrCardColor): void {
  const { ctx, px } = painter;
  ctx.fillStyle = colors.accent;
  roundedRect(painter, badge, badge.height / 2);
  ctx.fillStyle = colors.onAccent;
  ctx.font = fontOf(FONT_BOLD, px(badge.fontSizeMm));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(badge.text, px(badge.x + badge.width / 2), px(badge.y + badge.height / 2));
}

/** 흰 상자(quiet zone)를 먼저 그리고, 오류 정정 M·여백 0 QR을 픽셀 정수 크기로 얹는다 */
async function drawQr(painter: Painter, boxes: { frame: QrCardBox; qr: QrCardBox }, url: string): Promise<void> {
  const { ctx, px } = painter;
  ctx.fillStyle = QR_CARD_WHITE_BOX;
  roundedRect(painter, boxes.frame, QR_FRAME_RADIUS_MM);
  const size = Math.round(px(boxes.qr.width));
  const qrCanvas = document.createElement('canvas');
  await QRCode.toCanvas(qrCanvas, url, {
    errorCorrectionLevel: 'M',
    margin: 0,
    width: size,
    color: { dark: QR_CODE_DARK, light: QR_CARD_WHITE_BOX },
  });
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(qrCanvas, Math.round(px(boxes.qr.x)), Math.round(px(boxes.qr.y)), size, size);
  ctx.imageSmoothingEnabled = true;
}

function drawImage({ ctx, px }: Painter, image: HTMLImageElement, box: QrCardBox): void {
  ctx.drawImage(image, px(box.x), px(box.y), px(box.width), px(box.height));
}

/** 워드마크는 검정 글자라 어두운 카드에서도 보이게 흰 받침 위에 그린다 */
function drawWordmark(painter: Painter, plate: QrCardBox, image: HTMLImageElement): void {
  painter.ctx.fillStyle = QR_CARD_WHITE_BOX;
  roundedRect(painter, plate, WORDMARK_PLATE_RADIUS_MM);
  const pad = WORDMARK_PLATE_PADDING_MM;
  const inner = { x: plate.x + pad, y: plate.y + pad, width: plate.width - pad * 2, height: plate.height - pad * 2 };
  drawImage(painter, image, fitLogo(inner, naturalSize(image)));
}

function preparePainter(canvas: HTMLCanvasElement, cardSize: { width: number; height: number }, pixelWidth: number): Painter {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('QR 카드를 그릴 캔버스를 준비하지 못했어요');
  const scale = pixelWidth / cardSize.width;
  canvas.width = pixelWidth;
  canvas.height = Math.round(cardSize.height * scale);
  return { ctx, px: (mm) => mm * scale };
}

/** 계획(mm)을 그대로 그린다. 글자 폭은 굵은 글씨로 재서 보통 굵기 문구도 넘치지 않는다 */
export async function renderQrCard(canvas: HTMLCanvasElement, input: RenderQrCardInput): Promise<void> {
  const { design, logo, wordmark } = input;
  await loadFonts(`${design.title}${design.message}${QR_CARD_BADGE_TEXT}`);
  const colors = QR_CARD_COLORS[design.color];
  const painter = preparePainter(canvas, QR_CARD_SIZE_MM[design.layout], input.pixelWidth);
  const measure = (text: string, fontSizeMm: number) => {
    painter.ctx.font = fontOf(FONT_BOLD, painter.px(fontSizeMm));
    return painter.ctx.measureText(text).width / painter.px(1);
  };
  const plan = planQrCardLayout({ ...design, logo: logo ? naturalSize(logo) : null, measure });
  painter.ctx.fillStyle = colors.background;
  painter.ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (logo && plan.logo) drawImage(painter, logo, plan.logo);
  drawTextLines(painter, plan.title, { color: colors.text, weight: FONT_BOLD });
  drawBadge(painter, plan.badge, colors);
  await drawQr(painter, { frame: plan.qrFrame, qr: plan.qr }, input.qrUrl);
  if (plan.message) drawTextLines(painter, plan.message, { color: colors.text, weight: FONT_MEDIUM });
  if (wordmark && plan.wordmark) drawWordmark(painter, plan.wordmark, wordmark);
}
