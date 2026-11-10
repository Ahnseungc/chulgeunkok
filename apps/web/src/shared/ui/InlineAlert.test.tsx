/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import InlineAlert from './InlineAlert';

describe('InlineAlert', () => {
  afterEach(() => {
    cleanup();
  });

  it('문구가 없으면 아무것도 그리지 않는다', () => {
    const { container } = render(<InlineAlert message={null} />);
    expect(container.innerHTML).toBe('');
  });

  it('처음부터 문구가 있으면 펼침 없이 alert 로 바로 보인다', () => {
    render(<InlineAlert message="연결이 불안정해요." />);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe('연결이 불안정해요.');
    expect(alert.parentElement?.className).toBe('flow-reveal');
    expect(alert.parentElement?.style.opacity).not.toBe('0');
  });

  it('저장 결과는 status 로 알린다', () => {
    render(<InlineAlert message="저장했어요" role="status" color="fg.positive" />);
    expect(screen.getByRole('status').textContent).toBe('저장했어요');
  });

  it('뒤늦게 생긴 문구는 높이 0 에서 펼쳐진다', () => {
    const { rerender } = render(<InlineAlert message={null} />);
    rerender(<InlineAlert message="실패했어요" />);
    expect(screen.getByRole('alert').parentElement?.style.height).toBe('0px');
  });
});
