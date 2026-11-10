/**
 * @vitest-environment jsdom
 */
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ScreenHeader from './ScreenHeader';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

type ObserverCallback = (entries: Partial<IntersectionObserverEntry>[]) => void;

// 마지막으로 만든 IntersectionObserver 의 콜백과 관찰 대상을 잡아 둔다
let observed: { callback: ObserverCallback; target: Element | null } = { callback: () => {}, target: null };

class FakeIntersectionObserver {
  constructor(callback: ObserverCallback) {
    observed = { callback, target: null };
  }
  observe(target: Element) {
    observed.target = target;
  }
  disconnect() {}
}

const ROOT_TOP = 52;
const scrollTitle = (top: number, isIntersecting: boolean) =>
  act(() => {
    observed.callback([
      { isIntersecting, boundingClientRect: { top } as DOMRectReadOnly, rootBounds: { top: ROOT_TOP } as DOMRectReadOnly },
    ]);
  });

const renderScreen = () =>
  render(
    <main className="screen">
      <ScreenHeader backHref="/owner/s1" backLabel="매장 홈" title="근태 기록" />
      <h1>근태 기록</h1>
    </main>,
  );

describe('ScreenHeader', () => {
  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('뒤로가기 링크에 상위 화면 이름과 href 를 준다', () => {
    renderScreen();
    const back = screen.getByRole('link', { name: '뒤로 가기, 매장 홈' });
    expect(back.getAttribute('href')).toBe('/owner/s1');
  });

  it('작은 제목은 보조기기에 한 번만 읽히게 숨기고, 큰 제목을 관찰한다', () => {
    renderScreen();
    expect(screen.getAllByRole('heading', { name: '근태 기록' })).toHaveLength(1);
    expect(observed.target?.tagName).toBe('H1');
  });

  it('큰 제목이 바 밑으로 올라가면 축소하고, 돌아오면 펼친다', () => {
    const { container } = renderScreen();
    const header = container.querySelector('.screen-header');
    expect(header?.getAttribute('data-collapsed')).toBe('false');

    scrollTitle(-10, false);
    expect(header?.getAttribute('data-collapsed')).toBe('true');

    scrollTitle(60, true);
    expect(header?.getAttribute('data-collapsed')).toBe('false');
  });

  it('스택 전환 중 가로로 화면 밖에 있을 때(교차 없음, 아래쪽)는 펼친 채 둔다', () => {
    const { container } = renderScreen();
    scrollTitle(80, false);
    expect(container.querySelector('.screen-header')?.getAttribute('data-collapsed')).toBe('false');
  });
});
