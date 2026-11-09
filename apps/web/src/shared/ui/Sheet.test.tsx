/**
 * @vitest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Sheet from './Sheet';

// jsdom은 showModal/close 를 흉내만 낸다. open 속성과 close 이벤트를 직접 맞춘다
function stubDialog() {
  const showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  });
  const close = vi.fn(function (this: HTMLDialogElement) {
    if (!this.hasAttribute('open')) return;
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  });
  HTMLDialogElement.prototype.showModal = showModal;
  HTMLDialogElement.prototype.close = close;
  return { showModal, close };
}

const renderSheet = (open: boolean, onClose = vi.fn()) => (
  <Sheet open={open} title="반려 사유" onClose={onClose}>
    <button type="button">확인</button>
  </Sheet>
);

describe('Sheet', () => {
  let dialog: ReturnType<typeof stubDialog>;

  beforeEach(() => {
    dialog = stubDialog();
  });

  afterEach(() => {
    cleanup();
  });

  it('열면 showModal 로 띄우고 내용을 그린다', () => {
    render(renderSheet(true));

    expect(dialog.showModal).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: '확인' })).toBeTruthy();
    expect(screen.getByText('반려 사유')).toBeTruthy();
  });

  it('닫을 때는 내려가는 애니메이션이 끝난 뒤에 dialog.close() 한다', async () => {
    const onClose = vi.fn();
    const { rerender } = render(renderSheet(true, onClose));

    rerender(renderSheet(false, onClose));

    // 바로 닫지 않고 내용이 남아 있다
    expect(dialog.close).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '확인' })).toBeTruthy();

    await waitFor(() => expect(dialog.close).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('button', { name: '확인' })).toBeNull();
    // 부모가 닫은 것이라 onClose 는 다시 부르지 않는다
    expect(onClose).not.toHaveBeenCalled();
  });

  it('ESC 는 바로 닫지 않고 onClose 로 알린다', () => {
    const onClose = vi.fn();
    render(renderSheet(true, onClose));
    const element = document.querySelector('dialog');
    if (!element) throw new Error('dialog 없음');

    const cancel = new Event('cancel', { cancelable: true });
    act(() => {
      element.dispatchEvent(cancel);
    });

    expect(cancel.defaultPrevented).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(dialog.close).not.toHaveBeenCalled();
  });

  it('배경을 누르면 onClose, 내용을 누르면 그대로', () => {
    const onClose = vi.fn();
    render(renderSheet(true, onClose));

    fireEvent.click(screen.getByRole('button', { name: '확인' }));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('sheet-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
