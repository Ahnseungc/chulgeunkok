/**
 * QR 카드 배치 계획. 순수 함수, 단위 mm. 정본: docs/specs/qr-card §4.4, §5
 * 위에서 아래로 로고 → 매장 이름(title) → "직원 출퇴근" 뱃지 → QR → 안내 문구 → 워드마크 순서로 쌓고,
 * 남는 높이만큼 QR을 키운 뒤(최대값까지) 세로 가운데에 놓는다.
 */

import type { QrCardLayoutKey } from './qr-card-types';

export interface QrCardBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface QrCardTextBox extends QrCardBox {
  fontSizeMm: number;
  lineHeightMm: number;
  lines: string[];
}

export interface QrCardBadgeBox extends QrCardBox {
  fontSizeMm: number;
  text: string;
}

export interface QrCardLayoutPlan {
  size: { width: number; height: number };
  /** 흰 바탕 상자 (quiet zone 포함). 카드 배경과 상관없이 흰색 (§4.2) */
  qrFrame: QrCardBox;
  /** QR 모듈이 그려지는 정사각형. qrFrame 안쪽 */
  qr: QrCardBox;
  logo: QrCardBox | null;
  title: QrCardTextBox;
  badge: QrCardBadgeBox;
  /** 스티커는 항상 null (§4.4) */
  message: QrCardTextBox | null;
  /** 흰 받침 상자. 워드마크 이미지는 WORDMARK_PLATE_PADDING_MM 만큼 안쪽에 그린다. 스티커는 null */
  wordmark: QrCardBox | null;
}

export type MeasureText = (text: string, fontSizeMm: number) => number;

export interface PlanQrCardLayoutInput {
  layout: QrCardLayoutKey;
  title: string;
  message: string;
  logo: { width: number; height: number } | null;
  /** fontSizeMm 크기로 그린 text 의 폭(mm) */
  measure: MeasureText;
}

/** 실제 크기 (§4.4: 스탠드 A6, 스티커 80×80) */
export const QR_CARD_SIZE_MM: Record<QrCardLayoutKey, { width: number; height: number }> = {
  STAND: { width: 105, height: 148 },
  STICKER: { width: 80, height: 80 },
};

/** 300dpi PNG 해상도 (§5) */
export const QR_CARD_PIXELS: Record<QrCardLayoutKey, { width: number; height: number }> = {
  STAND: { width: 1240, height: 1748 },
  STICKER: { width: 945, height: 945 },
};

export const QR_CARD_BADGE_TEXT = '직원 출퇴근';
export const WORDMARK_PLATE_PADDING_MM = 1;
/** apps/web/public/brand/wordmark.png 1248×480 */
export const WORDMARK_ASPECT = 1248 / 480;

const ELLIPSIS = '…';
const TITLE_LINE_HEIGHT = 1.25;
const MESSAGE_LINE_HEIGHT = 1.4;
const BADGE_HEIGHT_RATIO = 1.6;
const BADGE_PADDING_X_RATIO = 1;
const TITLE_FONT_STEP_MM = 0.5;
const WORDMARK_HEIGHT_MM = 6;

interface LayoutSpec {
  marginMm: number;
  gapMm: number;
  logoArea: { width: number; height: number };
  title: { maxFontMm: number; minFontMm: number; maxLines: number };
  badgeFontMm: number;
  qr: { minMm: number; maxMm: number; quietMm: number };
  message: { fontMm: number; maxLines: number } | null;
  hasWordmark: boolean;
}

/**
 * QR 최소 스탠드 60mm·스티커 50mm (§4.4). 뱃지 글자는 3.2mm 이상 굵게.
 * quiet zone 은 실제 URL(버전 5, 37모듈)을 **최대** 크기로 그려도 3모듈 이상이 되게 최대값을 묶는다:
 * 스탠드 64/37×3 ≈ 5.19mm ≤ 5.5mm, 스티커 50/37×3 ≈ 4.05mm ≤ 4.1mm (스티커 QR 은 50mm 고정).
 * 어두운 카드(kokFill·black)에서는 이 흰 테두리가 QR 둘레의 유일한 여백이다.
 */
const LAYOUT_SPECS: Record<QrCardLayoutKey, LayoutSpec> = {
  STAND: {
    marginMm: 6,
    gapMm: 2.5,
    logoArea: { width: 40, height: 12 },
    title: { maxFontMm: 7, minFontMm: 5, maxLines: 2 },
    badgeFontMm: 3.6,
    qr: { minMm: 60, maxMm: 64, quietMm: 5.5 },
    message: { fontMm: 3.6, maxLines: 3 },
    hasWordmark: true,
  },
  STICKER: {
    marginMm: 2.5,
    gapMm: 0.8,
    logoArea: { width: 24, height: 4 },
    title: { maxFontMm: 4, minFontMm: 3.5, maxLines: 1 },
    badgeFontMm: 3.2,
    qr: { minMm: 50, maxMm: 50, quietMm: 4.1 },
    message: null,
    hasWordmark: false,
  },
};

interface TextFitInput {
  text: string;
  fontSizeMm: number;
  maxWidth: number;
  measure: MeasureText;
}

/** 넘치면 뒤에서부터 지우고 말줄임표를 붙인다 */
function ellipsize({ text, fontSizeMm, maxWidth, measure }: TextFitInput): string {
  const chars = [...text];
  while (chars.length > 0 && measure(chars.join('') + ELLIPSIS, fontSizeMm) > maxWidth) chars.pop();
  return chars.join('').trimEnd() + ELLIPSIS;
}

/** 글자 단위로 채우고, 줄 안에 공백이 있으면 마지막 공백에서 끊는다 */
function wrapText({ text, fontSizeMm, maxWidth, measure }: TextFitInput): string[] {
  const lines: string[] = [];
  let line = '';
  for (const char of text) {
    const next = line + char;
    if (line === '' || measure(next, fontSizeMm) <= maxWidth) {
      line = next;
      continue;
    }
    const cut = line.lastIndexOf(' ');
    lines.push(cut > 0 ? line.slice(0, cut) : line);
    line = (cut > 0 ? line.slice(cut + 1) : '') + char;
  }
  lines.push(line);
  return lines.map((each) => each.trim()).filter((each) => each !== '');
}

/** maxLines 를 넘으면 마지막 줄에 말줄임표 */
function wrapWithin(input: TextFitInput & { maxLines: number }): string[] {
  const lines = wrapText(input);
  if (lines.length <= input.maxLines) return lines;
  const kept = lines.slice(0, input.maxLines);
  const last = kept.length - 1;
  kept[last] = ellipsize({ ...input, text: kept[last] ?? '' });
  return kept;
}

type FittedText = Pick<QrCardTextBox, 'fontSizeMm' | 'lineHeightMm' | 'lines'>;

/** 한 줄에 들어갈 때까지 글자를 줄이고, 최소 크기에서도 넘치면 maxLines 로 줄바꿈 (스티커는 한 줄 + 말줄임) */
function fitTitle(text: string, maxWidth: number, spec: LayoutSpec, measure: MeasureText): FittedText {
  const { maxFontMm, minFontMm, maxLines } = spec.title;
  for (let size = maxFontMm; size >= minFontMm; size -= TITLE_FONT_STEP_MM) {
    if (measure(text, size) <= maxWidth) return { fontSizeMm: size, lineHeightMm: size * TITLE_LINE_HEIGHT, lines: [text] };
  }
  const input = { text, fontSizeMm: minFontMm, maxWidth, measure };
  const lines = maxLines === 1 ? [ellipsize(input)] : wrapWithin({ ...input, maxLines });
  return { fontSizeMm: minFontMm, lineHeightMm: minFontMm * TITLE_LINE_HEIGHT, lines };
}

function fitMessage(text: string, maxWidth: number, spec: LayoutSpec, measure: MeasureText): FittedText | null {
  if (spec.message === null || text.trim() === '') return null;
  const { fontMm, maxLines } = spec.message;
  const lines = wrapWithin({ text, fontSizeMm: fontMm, maxWidth, measure, maxLines });
  return { fontSizeMm: fontMm, lineHeightMm: fontMm * MESSAGE_LINE_HEIGHT, lines };
}

/** 비율을 지켜 area 안에 가장 크게, 가운데 정렬 */
export function fitLogo(area: QrCardBox, logo: { width: number; height: number }): QrCardBox {
  const scale = Math.min(area.width / logo.width, area.height / logo.height);
  const width = logo.width * scale;
  const height = logo.height * scale;
  return { x: area.x + (area.width - width) / 2, y: area.y + (area.height - height) / 2, width, height };
}

type BlockKey = 'logo' | 'title' | 'badge' | 'qrFrame' | 'message' | 'wordmark';
interface Block {
  key: BlockKey;
  width: number;
  height: number;
}

const textHeight = (text: FittedText) => text.lines.length * text.lineHeightMm;

/** 남는 높이만큼 QR을 키운다(최대값까지). 최소 크기도 안 들어가면 카드 밖으로 넘치니 바로 실패한다 */
function qrSizeFor(blocks: Block[], spec: LayoutSpec, cardHeight: number): number {
  const fixed = blocks.reduce((sum, block) => sum + block.height, 0) + spec.gapMm * blocks.length;
  const free = cardHeight - spec.marginMm * 2 - fixed - spec.qr.quietMm * 2;
  if (free < spec.qr.minMm) throw new Error(`QR 카드에 QR ${spec.qr.minMm}mm 자리가 없어요 (${free.toFixed(1)}mm)`);
  return Math.min(spec.qr.maxMm, free);
}

/** 블록을 세로로 쌓아 가운데에 놓고, 가로도 가운데 정렬한다 */
function stackBlocks(blocks: Block[], spec: LayoutSpec, size: { width: number; height: number }) {
  const total = blocks.reduce((sum, block) => sum + block.height, 0) + spec.gapMm * (blocks.length - 1);
  let y = (size.height - total) / 2;
  const boxes = new Map<BlockKey, QrCardBox>();
  for (const block of blocks) {
    boxes.set(block.key, { x: (size.width - block.width) / 2, y, width: block.width, height: block.height });
    y += block.height + spec.gapMm;
  }
  return boxes;
}

interface Contents {
  title: FittedText;
  message: FittedText | null;
  badge: { width: number; height: number };
  textWidth: number;
}

function measureContents(input: PlanQrCardLayoutInput, spec: LayoutSpec, cardWidth: number): Contents {
  const textWidth = cardWidth - spec.marginMm * 2;
  const badgeFont = spec.badgeFontMm;
  const badge = {
    width: input.measure(QR_CARD_BADGE_TEXT, badgeFont) + badgeFont * BADGE_PADDING_X_RATIO * 2,
    height: badgeFont * BADGE_HEIGHT_RATIO,
  };
  return {
    title: fitTitle(input.title, textWidth, spec, input.measure),
    message: fitMessage(input.message, textWidth, spec, input.measure),
    badge,
    textWidth,
  };
}

function blocksWithoutQr(contents: Contents, spec: LayoutSpec, hasLogo: boolean): Block[] {
  const { title, message, badge, textWidth } = contents;
  const wordmarkWidth = (WORDMARK_HEIGHT_MM - WORDMARK_PLATE_PADDING_MM * 2) * WORDMARK_ASPECT + WORDMARK_PLATE_PADDING_MM * 2;
  const blocks: (Block | null)[] = [
    hasLogo ? { key: 'logo', ...spec.logoArea } : null,
    { key: 'title', width: textWidth, height: textHeight(title) },
    { key: 'badge', ...badge },
    message ? { key: 'message', width: textWidth, height: textHeight(message) } : null,
    spec.hasWordmark ? { key: 'wordmark', width: wordmarkWidth, height: WORDMARK_HEIGHT_MM } : null,
  ];
  return blocks.filter((block): block is Block => block !== null);
}

/** QR은 뱃지 바로 아래 */
function insertQrFrame(blocks: Block[], frameSize: number): Block[] {
  const at = blocks.findIndex((block) => block.key === 'badge') + 1;
  return [...blocks.slice(0, at), { key: 'qrFrame', width: frameSize, height: frameSize }, ...blocks.slice(at)];
}

/** 항상 쌓는 블록(title·badge·qrFrame)을 꺼낸다. 없으면 배치 코드 버그 */
function requireBox(boxes: Map<BlockKey, QrCardBox>, key: BlockKey): QrCardBox {
  const box = boxes.get(key);
  if (!box) throw new Error(`QR 카드 배치에 ${key} 자리가 없어요`);
  return box;
}

/** §4.4 레이아웃 표의 요소를 카드 크기 안에 겹치지 않게 놓는다 */
export function planQrCardLayout(input: PlanQrCardLayoutInput): QrCardLayoutPlan {
  const spec = LAYOUT_SPECS[input.layout];
  const size = QR_CARD_SIZE_MM[input.layout];
  const contents = measureContents(input, spec, size.width);
  const blocks = blocksWithoutQr(contents, spec, input.logo !== null);
  const qrSize = qrSizeFor(blocks, spec, size.height);
  const boxes = stackBlocks(insertQrFrame(blocks, qrSize + spec.qr.quietMm * 2), spec, size);
  const qrFrame = requireBox(boxes, 'qrFrame');
  const logoArea = boxes.get('logo');
  const message = boxes.get('message');
  return {
    size,
    qrFrame,
    qr: { x: qrFrame.x + spec.qr.quietMm, y: qrFrame.y + spec.qr.quietMm, width: qrSize, height: qrSize },
    logo: logoArea && input.logo ? fitLogo(logoArea, input.logo) : null,
    title: { ...requireBox(boxes, 'title'), ...contents.title },
    badge: { ...requireBox(boxes, 'badge'), fontSizeMm: spec.badgeFontMm, text: QR_CARD_BADGE_TEXT },
    message: message && contents.message ? { ...message, ...contents.message } : null,
    wordmark: boxes.get('wordmark') ?? null,
  };
}
