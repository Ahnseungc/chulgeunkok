/**
 * @vitest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { QR_CARD_DEFAULT_MESSAGE, type QrCardDesignDto } from '../model/qr-card-types';

import { qrCardToPdf } from './export-qr-card';
import QrCardPreview from './QrCardPreview';
import QrCardScreen from './QrCardScreen';
import { renderQrCard } from './render-qr-card';
import { AUTOSAVE_DELAY_MS, designInputError } from './useQrCard';

// 렌더마다 새 router 를 주면 useApiResource 가 매번 다시 조회한다. 같은 객체를 돌려준다
const router = vi.hoisted(() => ({ push: () => {}, replace: () => {} }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

// jsdom 에는 캔버스가 없다. 그리기·파일 만들기는 목으로 바꾸고 무엇으로 불렀는지만 본다
vi.mock('./render-qr-card', () => ({ renderQrCard: vi.fn(async () => {}) }));
vi.mock('./export-qr-card', () => ({
  qrCardToPng: vi.fn(async () => new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' })),
  qrCardToPdf: vi.fn(async () => new Uint8Array([37, 80, 68, 70])),
  qrCardFileName: vi.fn(() => 'card.pdf'),
}));

const QR_URL = 'https://chulgeunkok.test/p/token';

const savedDesign: QrCardDesignDto = {
  layout: 'STAND',
  color: 'blue',
  title: '골목카페',
  message: QR_CARD_DEFAULT_MESSAGE,
  hasLogo: false,
  saved: true,
};

interface FetchCall {
  url: string;
  method: string;
  body: unknown;
}

const stubBrowser = () => {
  // Seed ActionButton 의 눌림 피드백이 ResizeObserver 를 쓴다
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  const drawImage = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => ({ drawImage }) as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:card'), revokeObjectURL: vi.fn() }));
  return { drawImage };
};

const stubApi = (qr: { url: string | null }) => {
  const calls: FetchCall[] = [];
  const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    calls.push({ url, method, body: init.body ? JSON.parse(String(init.body)) : undefined });
    const body = url.endsWith('/qr') ? { ...qr, issuedAt: '2026-11-01T00:00:00.000Z' } : savedDesign;
    return { ok: true, json: async () => body };
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
};

const putCalls = (calls: FetchCall[]) => calls.filter((call) => call.method === 'PUT');

const openScreen = async (qr: { url: string | null } = { url: QR_URL }) => {
  const calls = stubApi(qr);
  render(<QrCardScreen storeId="s1" />);
  await screen.findByDisplayValue('골목카페');
  return calls;
};

describe('QrCardScreen', () => {
  beforeEach(() => {
    stubBrowser();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.mocked(renderQrCard).mockClear();
    vi.mocked(qrCardToPdf).mockClear();
  });

  it('저장한 디자인이 컨트롤에 채워진다', async () => {
    await openScreen();
    expect(screen.getByRole('button', { name: '스탠드' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: '파랑' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: '출근콕 빨강' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByLabelText('안내 문구')).toHaveProperty('value', QR_CARD_DEFAULT_MESSAGE);
  });

  it('스티커를 고르면 안내 문구 입력이 사라진다', async () => {
    await openScreen();
    fireEvent.click(screen.getByRole('button', { name: '스티커' }));
    expect(screen.queryByLabelText('안내 문구')).toBeNull();
    expect(screen.getByRole('button', { name: '스티커' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('색을 누르면 aria-pressed가 바뀌고 800ms 뒤 PUT 한 번', async () => {
    const calls = await openScreen();
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: '초록' }));
    fireEvent.click(screen.getByRole('button', { name: '검정' }));
    expect(screen.getByRole('button', { name: '검정' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: '파랑' }).getAttribute('aria-pressed')).toBe('false');

    await act(async () => vi.advanceTimersByTime(AUTOSAVE_DELAY_MS - 1));
    expect(putCalls(calls)).toHaveLength(0);
    await act(async () => vi.advanceTimersByTime(1));
    expect(putCalls(calls)).toEqual([
      {
        url: '/api/v1/stores/s1/qr-design',
        method: 'PUT',
        body: { layout: 'STAND', color: 'black', title: '골목카페', message: QR_CARD_DEFAULT_MESSAGE },
      },
    ]);
  });

  it('매장 이름을 비우면 PUT 하지 않고 글자 수 안내', async () => {
    const calls = await openScreen();
    vi.useFakeTimers();
    fireEvent.change(screen.getByLabelText('매장 이름'), { target: { value: '  ' } });
    await act(async () => vi.advanceTimersByTime(AUTOSAVE_DELAY_MS));
    expect(putCalls(calls)).toHaveLength(0);
    expect(screen.getByText('매장 이름은 1~20자로 적어 주세요')).toBeTruthy();
  });

  it('url이 null이면 재발급 안내', async () => {
    await openScreen({ url: null });
    expect(screen.getByText('QR을 새로 만들어야 카드를 만들 수 있어요')).toBeTruthy();
    expect(screen.getByRole('button', { name: '새 QR 만들기' })).toBeTruthy();
    expect(screen.queryByRole('img', { name: 'QR 카드 미리보기' })).toBeNull();
    expect(screen.getByRole('button', { name: 'PDF 받기' })).toHaveProperty('disabled', true);
    expect(renderQrCard).not.toHaveBeenCalled();
  });

  it('PDF 받기는 현재 화면 값으로 qrCardToPdf를 부른다', async () => {
    const calls = await openScreen();
    fireEvent.click(screen.getByRole('button', { name: '스티커' }));
    fireEvent.click(screen.getByRole('button', { name: 'PDF 받기' }));

    await waitFor(() => expect(qrCardToPdf).toHaveBeenCalledTimes(1));
    // 저장(800ms)을 기다리지 않는다
    expect(putCalls(calls)).toHaveLength(0);
    expect(vi.mocked(qrCardToPdf).mock.calls[0]).toEqual([new Uint8Array([137, 80, 78, 71]), 'STICKER']);
    const exportCall = vi.mocked(renderQrCard).mock.calls.at(-1);
    expect(exportCall?.[1]).toMatchObject({
      design: { layout: 'STICKER', color: 'blue', title: '골목카페' },
      qrUrl: QR_URL,
      pixelWidth: 945,
    });
  });
});

describe('designInputError (§4.1)', () => {
  it('title 1~20자·message 40자 이하만 통과', () => {
    expect(designInputError({ title: '가'.repeat(20), message: '나'.repeat(40) })).toBeNull();
    expect(designInputError({ title: ' ', message: '' })).toBe('매장 이름은 1~20자로 적어 주세요');
    expect(designInputError({ title: '가'.repeat(21), message: '' })).toBe('매장 이름은 1~20자로 적어 주세요');
    expect(designInputError({ title: '가', message: '나'.repeat(41) })).toBe('안내 문구는 40자까지 적을 수 있어요');
  });
});

describe('QrCardPreview', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.mocked(renderQrCard).mockReset();
  });

  it('겹친 렌더는 마지막 요청만 화면에 옮긴다', async () => {
    const { drawImage } = stubBrowser();
    const pending: { canvas: HTMLCanvasElement; resolve: () => void }[] = [];
    vi.mocked(renderQrCard).mockImplementation(
      (canvas) => new Promise<void>((resolve) => pending.push({ canvas, resolve })),
    );
    const props = { qrUrl: QR_URL, logo: null, wordmark: null };
    const { rerender } = render(<QrCardPreview design={savedDesign} {...props} />);
    rerender(<QrCardPreview design={{ ...savedDesign, color: 'green' }} {...props} />);
    expect(pending).toHaveLength(2);

    await act(async () => pending[1]?.resolve());
    await act(async () => pending[0]?.resolve());
    expect(drawImage).toHaveBeenCalledTimes(1);
    expect(drawImage.mock.calls[0]?.[0]).toBe(pending[1]?.canvas);
  });
});
