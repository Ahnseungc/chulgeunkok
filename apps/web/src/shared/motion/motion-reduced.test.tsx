/**
 * @vitest-environment jsdom
 */
import { cleanup, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CardStaggerList } from './CardStaggerList';
import { EntrancePanel } from './Entrance';
import { SmoothCountUpNumber } from './SmoothCountUpNumber';
import { SuccessEntrance, SuccessEntranceItem, SuccessEntranceMark } from './SuccessEntrance';
import { useIntroCountUp } from './useIntroCountUp';

// framer-motion 은 처음 쓸 때 한 번 matchMedia 를 읽어 둔다. 이 파일 전체를 "모션 줄이기" 기기로 만든다
vi.stubGlobal('matchMedia', (query: string) => ({
  matches: query.includes('prefers-reduced-motion'),
  media: query,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
}));

describe('모션 줄이기', () => {
  afterEach(() => {
    cleanup();
  });

  it('카운트업 없이 최종 값을 바로 그린다', () => {
    render(<SmoothCountUpNumber value={100_000} animateFrom={35_000} durationSec={0.9} />);
    expect(screen.getByText('100,000')).toBeTruthy();
    expect(screen.queryByText('35,000')).toBeNull();
  });

  it('useIntroCountUp 은 인트로를 주지 않는다', () => {
    const { result } = renderHook(() => useIntroCountUp(100_000));
    expect(result.current).toEqual({ animateFrom: undefined, durationSec: 0 });
  });

  it('EntrancePanel 은 숨긴 채 시작하지 않는다', () => {
    render(<EntrancePanel>새 QR</EntrancePanel>);
    const panel = screen.getByText('새 QR');
    expect(panel.style.opacity).toBe('');
    expect(panel.style.transform).toBe('');
  });

  it('CardStaggerList 는 행을 그대로 그린다', () => {
    render(<CardStaggerList items={['a', 'b']} getKey={(item) => item} renderItem={(item) => <span>{item}</span>} />);
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]?.style.opacity).toBe('');
  });

  it('SuccessEntrance 는 마크·문구를 숨긴 채 시작하지 않는다', () => {
    render(
      <SuccessEntrance>
        <SuccessEntranceMark>
          <span>마크</span>
        </SuccessEntranceMark>
        <SuccessEntranceItem>
          <span>콕! 출근 완료</span>
        </SuccessEntranceItem>
      </SuccessEntrance>,
    );
    expect(screen.getByText('마크').parentElement?.style.opacity).toBe('1');
    expect(screen.getByText('콕! 출근 완료').parentElement?.style.opacity).toBe('1');
  });
});
