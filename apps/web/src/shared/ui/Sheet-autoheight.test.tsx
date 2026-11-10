/**
 * @vitest-environment jsdom
 */
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Sheet from './Sheet';

// jsdom 에는 ResizeObserver·레이아웃이 없다. 관찰 콜백을 직접 부르고 offsetHeight 를 바꿔 끼운다
let resize: (() => void) | null = null;
class FakeResizeObserver {
  constructor(callback: () => void) {
    resize = callback;
  }
  observe() {}
  disconnect() {}
}

let contentHeight = 0;

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(() => contentHeight);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resize = null;
});

const heightBox = () => screen.getByText('내용').closest('.sheet__body')!.parentElement!.parentElement as HTMLElement;

const reportHeight = (height: number) =>
  act(() => {
    contentHeight = height;
    resize?.();
  });

describe('Sheet 내용 높이 변화', () => {
  it('닫힌 dialog 안에서 잰 0 은 무시하고, 처음 잰 높이는 전환 없이 적용한다', () => {
    render(
      <Sheet open title="QR" onClose={vi.fn()}>
        <p>내용</p>
      </Sheet>,
    );
    reportHeight(0);
    expect(heightBox().style.height).toBe('auto');

    reportHeight(300);
    expect(heightBox().style.height).toBe('300px');
    expect(heightBox().style.transition).toBe('none');
  });

  it('그다음 높이가 바뀌면 height 전환으로 늘어난다', () => {
    render(
      <Sheet open title="QR" onClose={vi.fn()}>
        <p>내용</p>
      </Sheet>,
    );
    reportHeight(300);
    reportHeight(420);

    expect(heightBox().style.height).toBe('420px');
    expect(heightBox().style.transition).toContain('height');
  });
});
