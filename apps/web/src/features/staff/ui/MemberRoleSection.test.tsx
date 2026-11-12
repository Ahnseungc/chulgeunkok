/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiRequestError } from '@/shared/lib/api-client';

import MemberRoleSection from './MemberRoleSection';

const apiFetch = vi.fn();
const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
vi.mock('@/shared/lib/api-client', () => ({
  apiFetch: (path: string, init?: RequestInit) => apiFetch(path, init),
  ApiRequestError: class ApiRequestError extends Error {
    constructor(input: { message: string }) {
      super(input.message);
    }
  },
}));
vi.mock('@/shared/ui/useToast', () => ({ useToast: () => toast }));
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

const MEMBER_PATH = '/api/v1/stores/s1/members/m1';

const renderSection = (props: Partial<Parameters<typeof MemberRoleSection>[0]> = {}) => {
  const onSaved = vi.fn();
  render(<MemberRoleSection memberPath={MEMBER_PATH} role="EMPLOYEE" permissions={[]} onSaved={onSaved} {...props} />);
  return { onSaved };
};

const saveButton = () => screen.getByRole('button', { name: '저장' });

describe('MemberRoleSection (staff §4.2)', () => {
  afterEach(() => {
    cleanup();
    apiFetch.mockReset();
    vi.clearAllMocks();
  });

  it('직원이면 권한 선택이 없고, 바꾼 게 없으면 저장할 수 없다', () => {
    renderSection();
    expect(screen.getByRole('button', { name: '직원' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(saveButton().hasAttribute('disabled')).toBe(true);
  });

  it('매니저로 올리고 급여 보기를 맡기면 PATCH 후 토스트를 띄우고 다시 불러온다', async () => {
    apiFetch.mockResolvedValue({});
    const { onSaved } = renderSection();
    fireEvent.click(screen.getByRole('button', { name: '매니저' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /급여 보기/ }));
    fireEvent.click(saveButton());
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(apiFetch).toHaveBeenCalledWith(MEMBER_PATH, {
      method: 'PATCH',
      body: JSON.stringify({ role: 'MANAGER', permissions: ['PAYROLL_READ'] }),
    });
    expect(toast.success).toHaveBeenCalledWith('역할·권한을 바꿨어요');
  });

  it('매니저를 직원으로 내리면 권한 선택이 사라지고 빈 권한으로 보낸다', async () => {
    apiFetch.mockResolvedValue({});
    renderSection({ role: 'MANAGER', permissions: ['PAYROLL_READ', 'TERMS_EDIT'] });
    expect(screen.getByRole('checkbox', { name: /근로조건 등록/ })).toHaveProperty('checked', true);
    fireEvent.click(screen.getByRole('button', { name: '직원' }));
    expect(screen.queryByRole('checkbox')).toBeNull();
    fireEvent.click(saveButton());
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(apiFetch).toHaveBeenCalledWith(MEMBER_PATH, {
      method: 'PATCH',
      body: JSON.stringify({ role: 'EMPLOYEE', permissions: [] }),
    });
  });

  it('실패하면 문구를 구역 안에 보여 주고 다시 불러오지 않는다', async () => {
    apiFetch.mockRejectedValue(new ApiRequestError({ code: 'INTERNAL', message: '잠시 후 다시 시도해 주세요.', status: 500 }));
    const { onSaved } = renderSection();
    fireEvent.click(screen.getByRole('button', { name: '매니저' }));
    fireEvent.click(saveButton());
    expect((await screen.findByRole('alert')).textContent).toBe('잠시 후 다시 시도해 주세요.');
    expect(onSaved).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });
});
