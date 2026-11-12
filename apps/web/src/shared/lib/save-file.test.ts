/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { saveFile } from './save-file';

const PDF_BYTES = new Uint8Array([37, 80, 68, 70, 45]); // "%PDF-"

describe('saveFile', () => {
  afterEach(() => {
    delete window.ReactNativeWebView;
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('앱 WebView 안이면 SAVE_FILE 을 base64 로 보낸다', async () => {
    const postMessage = vi.fn();
    window.ReactNativeWebView = { postMessage };
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click');

    await saveFile(new Blob([PDF_BYTES], { type: 'application/pdf' }), '출근콕-QR카드-골목카페-스탠드.pdf', 'application/pdf');

    expect(click).not.toHaveBeenCalled();
    expect(JSON.parse(postMessage.mock.calls[0]?.[0] as string)).toEqual({
      type: 'SAVE_FILE',
      fileName: '출근콕-QR카드-골목카페-스탠드.pdf',
      mime: 'application/pdf',
      base64: 'JVBERi0=',
    });
  });

  it('파일 이름의 경로 구분자는 바꿔서 보낸다', async () => {
    const postMessage = vi.fn();
    window.ReactNativeWebView = { postMessage };
    await saveFile(new Blob([PDF_BYTES]), '골목/카페-출근QR.png', 'image/png');
    expect(JSON.parse(postMessage.mock.calls[0]?.[0] as string).fileName).toBe('골목_카페-출근QR.png');
  });

  it('브라우저면 <a download> 로 받고 잠시 뒤 URL 을 푼다', async () => {
    vi.useFakeTimers();
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:card'), revokeObjectURL }));
    const anchors: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      anchors.push(this);
    });

    await saveFile(new Blob([PDF_BYTES], { type: 'image/png' }), 'card.png', 'image/png');

    expect(anchors).toHaveLength(1);
    expect(anchors[0]?.download).toBe('card.png');
    expect(anchors[0]?.href).toBe('blob:card');
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:card');
  });
});
