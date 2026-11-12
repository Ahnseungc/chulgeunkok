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
  type MeasureText,
  type QrCardBadgeBox,
  type QrCardBox,
  type QrCardTextBox,
} from '../model/qr-card-layout';
import type { QrCardColorKey, QrCardDesignDto } from '../model/qr-card-types';

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

/** 오류 정정 M·여백 0 QR을 픽셀 정수 크기의 별도 캔버스에 미리 그린다 */
async function makeQrCanvas(url: string, sizePx: number): Promise<HTMLCanvasElement> {
  const qrCanvas = document.createElement('canvas');
  await QRCode.toCanvas(qrCanvas, url, {
    errorCorrectionLevel: 'M',
    margin: 0,
    width: sizePx,
    color: { dark: QR_CODE_DARK, light: QR_CARD_WHITE_BOX },
  });
  return qrCanvas;
}

/** 흰 상자(quiet zone)를 먼저 그리고 미리 만든 QR을 얹는다 */
function drawQr(painter: Painter, boxes: { frame: QrCardBox; qr: QrCardBox }, qrCanvas: HTMLCanvasElement): void {
  const { ctx, px } = painter;
  ctx.fillStyle = QR_CARD_WHITE_BOX;
  roundedRect(painter, boxes.frame, QR_FRAME_RADIUS_MM);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(qrCanvas, Math.round(px(boxes.qr.x)), Math.round(px(boxes.qr.y)), qrCanvas.width, qrCanvas.height);
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

const pxScale = (cardWidthMm: number, pixelWidth: number) => pixelWidth / cardWidthMm;

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('QR 카드를 그릴 캔버스를 준비하지 못했어요');
  return ctx;
}

/** 글자 폭은 굵은 글씨로 잰다. 보통 굵기 문구도 넘치지 않는다. 대상 캔버스를 건드리지 않게 따로 잰다 */
function createMeasure(scale: number): MeasureText {
  const ctx = context2d(document.createElement('canvas'));
  return (text, fontSizeMm) => {
    ctx.font = fontOf(FONT_BOLD, fontSizeMm * scale);
    return ctx.measureText(text).width / scale;
  };
}

async function decodeImages(images: (HTMLImageElement | null)[]): Promise<void> {
  await Promise.all(images.map((image) => image?.decode()));
}

/** 기다릴 일(폰트·이미지 디코드·QR)을 모두 끝낸 뒤의 그릴 재료 */
async function prepareRender(input: RenderQrCardInput) {
  const { design, logo, wordmark } = input;
  await Promise.all([loadFonts(`${design.title}${design.message}${QR_CARD_BADGE_TEXT}`), decodeImages([logo, wordmark])]);
  const scale = pxScale(QR_CARD_SIZE_MM[design.layout].width, input.pixelWidth);
  const plan = planQrCardLayout({ ...design, logo: logo ? naturalSize(logo) : null, measure: createMeasure(scale) });
  const qrCanvas = await makeQrCanvas(input.qrUrl, Math.round(plan.qr.width * scale));
  return { plan, qrCanvas, scale };
}

/** 빨강 채움 카드는 흰 문구 대비가 3.7:1 이라 문구도 굵게 그린다 */
const BOLD_MESSAGE_COLORS: ReadonlySet<QrCardColorKey> = new Set(['kokFill']);

/**
 * 계획(mm)을 그대로 그린다. await 는 모두 prepareRender 에서 끝내고 캔버스는 한 번에 동기로 칠한다.
 * 그래서 겹친 두 렌더가 한 캔버스 위에서 섞이지 않는다 (나중에 끝난 쪽이 통째로 덮는다).
 */
export async function renderQrCard(canvas: HTMLCanvasElement, input: RenderQrCardInput): Promise<void> {
  const { design, logo, wordmark } = input;
  const { plan, qrCanvas, scale } = await prepareRender(input);
  const colors = QR_CARD_COLORS[design.color];
  const ctx = context2d(canvas);
  canvas.width = input.pixelWidth;
  canvas.height = Math.round(plan.size.height * scale);
  const painter: Painter = { ctx, px: (mm) => mm * scale };
  ctx.fillStyle = colors.background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (logo && plan.logo) drawImage(painter, logo, plan.logo);
  drawTextLines(painter, plan.title, { color: colors.text, weight: FONT_BOLD });
  drawBadge(painter, plan.badge, colors);
  drawQr(painter, { frame: plan.qrFrame, qr: plan.qr }, qrCanvas);
  const messageWeight = BOLD_MESSAGE_COLORS.has(design.color) ? FONT_BOLD : FONT_MEDIUM;
  if (plan.message) drawTextLines(painter, plan.message, { color: colors.text, weight: messageWeight });
  if (wordmark && plan.wordmark) drawWordmark(painter, plan.wordmark, wordmark);
}
