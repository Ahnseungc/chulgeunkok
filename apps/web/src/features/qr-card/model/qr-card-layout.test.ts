import { describe, expect, it } from 'vitest';

import { QR_CARD_DEFAULT_MESSAGE, type QrCardLayoutKey } from './qr-card-types';
import { fitLogo, planQrCardLayout, type QrCardBox, type QrCardLayoutPlan } from './qr-card-layout';

/** 글자 수 × 글자 크기. 한글 한 글자 폭 ≈ 1em 이라 실제와 비슷하다 */
const measure = (text: string, fontSizeMm: number) => [...text].length * fontSizeMm;

/** 실제보다 넓게 재서 40자 문구가 3줄이 되는 최악 경우 */
const WIDE_GLYPH = 1.6;
const wideMeasure = (text: string, fontSizeMm: number) => measure(text, fontSizeMm) * WIDE_GLYPH;
/** 실제 출퇴근 URL(origin + /p/ + 43자)은 QR 버전 5 = 37×37 모듈 */
const QR_V5_MODULES = 37;
const MIN_QUIET_MODULES = 3;
const QR_MIN_MM = { STAND: 60, STICKER: 50 } as const;

const TITLE_20 = '가'.repeat(20);
const MESSAGE_40 = '나'.repeat(40);
const LOGO = { width: 512, height: 512 };

const plan = (layout: QrCardLayoutKey, overrides: Partial<Parameters<typeof planQrCardLayout>[0]> = {}) =>
  planQrCardLayout({ layout, title: '출근콕 카페', message: QR_CARD_DEFAULT_MESSAGE, logo: null, measure, ...overrides });

const boxesOf = (p: QrCardLayoutPlan): QrCardBox[] =>
  [p.logo, p.title, p.badge, p.qrFrame, p.message, p.wordmark].filter((box): box is QrCardBox => box !== null);

const inside = (box: QrCardBox, outer: { width: number; height: number }) =>
  box.x >= 0 && box.y >= 0 && box.x + box.width <= outer.width && box.y + box.height <= outer.height;

const overlaps = (a: QrCardBox, b: QrCardBox) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

describe('planQrCardLayout', () => {
  it('스탠드는 105×148, QR 60mm 이상', () => {
    const p = plan('STAND');
    expect(p.size).toEqual({ width: 105, height: 148 });
    expect(p.qr.width).toBeGreaterThanOrEqual(60);
    expect(p.qr.height).toBe(p.qr.width);
    expect(p.qr.x + p.qr.width / 2).toBeCloseTo(105 / 2);
  });

  it('스티커는 80×80, QR 50mm 이상, message·wordmark 없음', () => {
    const p = plan('STICKER');
    expect(p.size).toEqual({ width: 80, height: 80 });
    expect(p.qr.width).toBeGreaterThanOrEqual(50);
    expect(p.message).toBeNull();
    expect(p.wordmark).toBeNull();
  });

  describe.each(['STAND', 'STICKER'] as const)('%s', (layout) => {
    it.each([null, LOGO])('모든 상자가 카드 안에 있고 겹치지 않는다 (logo=%o)', (logo) => {
      const p = plan(layout, { title: TITLE_20, message: MESSAGE_40, logo });
      const boxes = boxesOf(p);
      boxes.forEach((box) => expect(inside(box, p.size)).toBe(true));
      boxes.forEach((a, i) => boxes.slice(i + 1).forEach((b) => expect(overlaps(a, b)).toBe(false)));
      expect(inside({ ...p.qr, x: p.qr.x - p.qrFrame.x, y: p.qr.y - p.qrFrame.y }, p.qrFrame)).toBe(true);
    });

    it.each([null, LOGO])('3줄 문구에서도 상자가 카드 안에 있고 겹치지 않는다 (logo=%o)', (logo) => {
      const p = plan(layout, { title: TITLE_20, message: MESSAGE_40, logo, measure: wideMeasure });
      if (layout === 'STAND') expect(p.message?.lines).toHaveLength(3);
      const boxes = boxesOf(p);
      boxes.forEach((box) => expect(inside(box, p.size)).toBe(true));
      boxes.forEach((a, i) => boxes.slice(i + 1).forEach((b) => expect(overlaps(a, b)).toBe(false)));
      expect(p.qr.width).toBeGreaterThanOrEqual(QR_MIN_MM[layout]);
    });

    it('QR 최소 크기에서 quiet zone 은 버전 5 기준 3모듈 이상', () => {
      const p = plan(layout, { title: TITLE_20, message: MESSAGE_40, logo: LOGO, measure: wideMeasure });
      const quiet = p.qr.x - p.qrFrame.x;
      expect(quiet).toBeGreaterThanOrEqual((QR_MIN_MM[layout] / QR_V5_MODULES) * MIN_QUIET_MODULES);
      expect(p.qrFrame.x + p.qrFrame.width - (p.qr.x + p.qr.width)).toBeCloseTo(quiet);
    });

    it('20자 제목은 카드 폭 안에 들어간다', () => {
      const { title, size } = plan(layout, { title: TITLE_20 });
      expect(inside(title, size)).toBe(true);
      title.lines.forEach((line) => expect(measure(line, title.fontSizeMm)).toBeLessThanOrEqual(title.width));
    });
  });

  it('스티커 제목은 한 줄이다', () => {
    expect(plan('STICKER', { title: '가'.repeat(30) }).title.lines).toHaveLength(1);
  });

  it('40자 문구는 3줄 이하', () => {
    const { message } = plan('STAND', { message: MESSAGE_40 });
    expect(message).not.toBeNull();
    expect(message?.lines.length).toBeLessThanOrEqual(3);
    message?.lines.forEach((line) => expect(measure(line, message.fontSizeMm)).toBeLessThanOrEqual(message.width));
    expect(message?.lines.join('')).toBe(MESSAGE_40);
  });

  it('빈 문구는 message 없음', () => {
    expect(plan('STAND', { message: '' }).message).toBeNull();
  });
});

describe('fitLogo', () => {
  it('넓은 로고는 비율을 지켜 영역 안에 맞춘다', () => {
    const area = { x: 10, y: 5, width: 40, height: 12 };
    const box = fitLogo(area, { width: 512, height: 64 });
    expect(box.width / box.height).toBeCloseTo(512 / 64);
    expect(box.width).toBeCloseTo(40);
    expect(box.height).toBeLessThanOrEqual(12);
    expect(box.x).toBeCloseTo(10);
    expect(box.y + box.height / 2).toBeCloseTo(5 + 12 / 2);
  });
});
