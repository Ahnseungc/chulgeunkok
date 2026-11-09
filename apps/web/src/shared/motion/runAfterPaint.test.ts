import { afterEach, describe, expect, it, vi } from 'vitest';

import { runAfterPaint, runAfterPaintWhen } from './runAfterPaint';

describe('runAfterPaint', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('이중 requestAnimationFrame 이후 callback을 실행한다', () => {
    const callback = vi.fn();
    const rafQueue: FrameRequestCallback[] = [];

    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      rafQueue.push(cb);
      return rafQueue.length;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    runAfterPaint(callback);
    expect(callback).not.toHaveBeenCalled();

    rafQueue.shift()?.(0);
    expect(callback).not.toHaveBeenCalled();

    rafQueue.shift()?.(0);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('cleanup 시 callback이 실행되지 않는다', () => {
    const callback = vi.fn();
    const rafQueue: FrameRequestCallback[] = [];

    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      rafQueue.push(cb);
      return rafQueue.length;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    const cleanup = runAfterPaint(callback);
    cleanup();

    rafQueue.shift()?.(0);
    rafQueue.shift()?.(0);
    expect(callback).not.toHaveBeenCalled();
  });

  it('runAfterPaintWhen은 준비 조건 충족 후 callback을 실행한다', () => {
    const callback = vi.fn();
    const rafQueue: FrameRequestCallback[] = [];
    let ready = false;

    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      rafQueue.push(cb);
      return rafQueue.length;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    runAfterPaintWhen(() => ready, callback);

    const flushPaint = () => {
      rafQueue.shift()?.(0);
      rafQueue.shift()?.(0);
    };

    flushPaint();
    expect(callback).not.toHaveBeenCalled();

    ready = true;
    flushPaint();
    expect(callback).toHaveBeenCalledTimes(1);
  });
});
