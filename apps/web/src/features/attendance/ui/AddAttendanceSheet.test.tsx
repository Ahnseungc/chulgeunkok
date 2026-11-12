/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ToastProvider from '@/shared/ui/Toast';

import type { AttendanceListDto } from '../model/attendance-admin-types';

import { toAttendanceRange } from './AddAttendanceSheet';
import AttendancesScreen from './AttendancesScreen';

// 렌더마다 새 router 를 주면 useApiResource 가 매번 다시 조회한다. 같은 객체를 돌려준다
const router = vi.hoisted(() => ({ push: () => {}, replace: () => {} }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const emptyList: AttendanceListDto = {
  period: { start: '2026-11-01', end: '2026-12-01', prevStart: '2026-10-01', nextStart: null },
  rows: [],
};
const members = {
  members: [
    { memberId: 'm1', name: '이알바', role: 'EMPLOYEE', status: 'ACTIVE', joinedAt: '', leftAt: null, isWorking: false, hasTerms: true, openReviewCount: 0 },
  ],
};

interface FetchCall {
  url: string;
  method: string;
  body: unknown;
}

const stubApi = (postResponse: { ok: boolean; body: unknown }) => {
  const calls: FetchCall[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      calls.push({ url, method, body: init.body ? JSON.parse(String(init.body)) : null });
      if (method === 'POST') return { ok: postResponse.ok, json: async () => postResponse.body };
      return { ok: true, json: async () => (url.includes('/members') ? members : emptyList) };
    }),
  );
  return calls;
};

const listLoads = (calls: FetchCall[]) => calls.filter((call) => call.method === 'GET' && call.url.includes('/attendances?')).length;

const openSheet = async () => {
  render(
    <ToastProvider>
      <AttendancesScreen storeId="s1" />
    </ToastProvider>,
  );
  await screen.findByRole('option', { name: '이알바' });
  fireEvent.click(screen.getByRole('button', { name: '근무 추가' }));
  return screen.getByRole('dialog', { name: '빠진 근무 추가' });
};

const fillForm = (sheet: HTMLElement, overrides: Partial<Record<'직원' | '날짜' | '출근' | '퇴근' | '추가하는 이유 (기록에 남아요)', string>> = {}) => {
  const values = { 직원: 'm1', 날짜: '2026-11-03', 출근: '18:00', 퇴근: '23:00', '추가하는 이유 (기록에 남아요)': 'QR을 못 찍음', ...overrides };
  for (const [label, value] of Object.entries(values)) {
    fireEvent.change(within(sheet).getByLabelText(label), { target: { value } });
  }
};

describe('toAttendanceRange', () => {
  it('퇴근이 출근보다 늦으면 같은 날', () => {
    expect(toAttendanceRange('2026-11-03', '18:00', '23:00')).toEqual({
      clockInAt: '2026-11-03T09:00:00.000Z',
      clockOutAt: '2026-11-03T14:00:00.000Z',
    });
  });

  it('퇴근이 출근보다 이르면 다음 날로 본다', () => {
    expect(toAttendanceRange('2026-11-03', '22:00', '02:00').clockOutAt).toBe('2026-11-03T17:00:00.000Z');
  });
});

describe('AddAttendanceSheet', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    };
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('필수 칸을 다 채우기 전엔 추가 버튼이 꺼져 있다', async () => {
    stubApi({ ok: true, body: {} });
    const sheet = await openSheet();
    const submit = within(sheet).getByRole('button', { name: '추가' });
    fillForm(sheet, { '추가하는 이유 (기록에 남아요)': '  ' });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    fillForm(sheet);
    expect((submit as HTMLButtonElement).disabled).toBe(false);
  });

  it('추가하면 값을 보내고 토스트를 띄운 뒤 목록을 다시 불러온다', async () => {
    const calls = stubApi({ ok: true, body: { id: 'a1' } });
    const sheet = await openSheet();
    fillForm(sheet, { 출근: '22:00', 퇴근: '02:00' });
    fireEvent.click(within(sheet).getByLabelText('휴게를 못 썼어요 (휴게시간을 빼지 않아요)'));
    const loadsBefore = listLoads(calls);
    fireEvent.click(within(sheet).getByRole('button', { name: '추가' }));

    expect(await screen.findByText('근무를 추가했어요')).toBeTruthy();
    expect(calls.find((call) => call.method === 'POST')).toEqual({
      url: '/api/v1/stores/s1/attendances',
      method: 'POST',
      body: {
        memberId: 'm1',
        clockInAt: '2026-11-03T13:00:00.000Z',
        clockOutAt: '2026-11-03T17:00:00.000Z',
        breakWaived: true,
        reason: 'QR을 못 찍음',
      },
    });
    await waitFor(() => expect(listLoads(calls)).toBeGreaterThan(loadsBefore));
  });

  it('서버가 거절하면 시트 안에 이유를 보여 준다', async () => {
    stubApi({ ok: false, body: { error: { code: 'ATTENDANCE_CONFLICT', message: '다른 근무 기록과 겹쳐요.' } } });
    const sheet = await openSheet();
    fillForm(sheet);
    fireEvent.click(within(sheet).getByRole('button', { name: '추가' }));
    expect(await within(sheet).findByText('다른 근무 기록과 겹쳐요.')).toBeTruthy();
  });
});
