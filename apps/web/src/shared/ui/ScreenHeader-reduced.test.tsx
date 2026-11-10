/**
 * @vitest-environment jsdom
 */
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import ScreenHeader from './ScreenHeader';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

// framer-motion 은 처음 쓸 때 한 번 matchMedia 를 읽어 둔다. 이 파일 전체를 "모션 줄이기" 기기로 만든다
vi.stubGlobal('matchMedia', (query: string) => ({
  matches: query.includes('prefers-reduced-motion'),
  media: query,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
}));

type ObserverCallback = (entries: Partial<IntersectionObserverEntry>[]) => void;
let observerCallback: ObserverCallback = () => {};

vi.stubGlobal(
  'IntersectionObserver',
  class {
    constructor(callback: ObserverCallback) {
      observerCallback = callback;
    }
    observe() {}
    disconnect() {}
  },
);

describe('ScreenHeader 모션 줄이기', () => {
  afterEach(() => {
    cleanup();
  });

  it('큰 제목이 올라가면 작은 제목을 즉시 보여 준다', async () => {
    const { container } = render(
      <main className="screen">
        <ScreenHeader backHref="/me" backLabel="내 근무" title="11월 4일" />
        <h1>11월 4일</h1>
      </main>,
    );
    const title = container.querySelector<HTMLElement>('.screen-header__title');
    expect(title?.style.opacity).toBe('0');

    act(() => {
      observerCallback([
        { isIntersecting: false, boundingClientRect: { top: -10 } as DOMRectReadOnly, rootBounds: { top: 52 } as DOMRectReadOnly },
      ]);
    });
    // 전환 시간 0 — 다음 프레임 한 번이면 끝난다
    await act(() => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined))));
    expect(title?.style.opacity).toBe('1');
  });
});
