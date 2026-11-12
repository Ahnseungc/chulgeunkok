/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ToastProvider from '@/shared/ui/Toast';

import type { AttendanceDetailDto } from '../model/attendance-admin-types';

import AttendanceDetailScreen from './AttendanceDetailScreen';

const router = vi.hoisted(() => ({ push: () => {}, replace: () => {}, back: () => {} }));
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/owner/s1/attendances/a1' }));

// 11/2 18:00–23:00 (KST), 휴게 20:00:40–20:20:10 (초까지 남은 직원 기록)
const DETAIL: AttendanceDetailDto = {
  id: 'a1', memberId: 'm1', name: '이알바', localDate: '2026-11-02',
  clockInAt: '2026-11-02T09:00:00.000Z', clockOutAt: '2026-11-02T14:00:00.000Z', status: 'CLOSED',
  outsideArea: null, breakWaived: false, revised: false,
  workedSeconds: 5 * 3600, breakSeconds: 20 * 60, recognizedSeconds: 5 * 3600 - 20 * 60, breakNotScheduled: false,
  breaks: [{ id: 'b1', startAt: '2026-11-02T11:00:40.000Z', endAt: '2026-11-02T11:20:10.000Z' }],
  revisions: [], corrections: [],
};

interface FetchCall {
  method: string;
  url: string;
  body: unknown;
}

const stubApi = (detail: AttendanceDetailDto, putResponse: { ok: boolean; body: unknown } = { ok: true, body: detail }) => {
  const calls: FetchCall[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      calls.push({ method, url, body: init.body ? JSON.parse(String(init.body)) : null });
      if (method === 'PUT') return { ok: putResponse.ok, json: async () => putResponse.body };
      return { ok: true, json: async () => detail };
    }),
  );
  return calls;
};

const renderScreen = () =>
  render(
    <ToastProvider>
      <AttendanceDetailScreen storeId="s1" attendanceId="a1" />
    </ToastProvider>,
  );

const openSheet = async () => {
  renderScreen();
  fireEvent.click(await screen.findByRole('button', { name: '휴게 고치기' }));
  return screen.getByRole('dialog', { name: '휴게 고치기' });
};

const type = (sheet: HTMLElement, label: string, value: string) =>
  fireEvent.change(within(sheet).getByLabelText(label), { target: { value } });

const saveButton = (sheet: HTMLElement) => within(sheet).getByRole('button', { name: '저장' }) as HTMLButtonElement;

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
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

describe('BreakEditSheet (attendance §7.6)', () => {
  it('지금 휴게로 채워 열리고, 이유를 쓰기 전엔 저장이 꺼져 있다', async () => {
    stubApi(DETAIL);
    const sheet = await openSheet();
    expect((within(sheet).getByLabelText('휴게 1 시작') as HTMLInputElement).value).toBe('20:00');
    expect((within(sheet).getByLabelText('휴게 1 끝') as HTMLInputElement).value).toBe('20:20');
    expect(within(sheet).getByText('1분이 안 되는 휴게는 정산에 넣지 않고, 저장하면 지워져요.')).toBeTruthy();
    expect(saveButton(sheet).disabled).toBe(true);
  });

  it('아무것도 고치지 않았으면 이유를 써도 저장이 꺼져 있다', async () => {
    stubApi(DETAIL);
    const sheet = await openSheet();
    type(sheet, '고치는 이유 (기록에 남아요)', '확인만');
    expect(saveButton(sheet).disabled).toBe(true);
    type(sheet, '휴게 1 끝', '20:30');
    expect(saveButton(sheet).disabled).toBe(false);
  });

  it('고치고 더해 저장하면 PUT 을 보내고 토스트를 띄운 뒤 다시 불러온다', async () => {
    const calls = stubApi(DETAIL);
    const sheet = await openSheet();
    type(sheet, '휴게 1 끝', '20:30');
    fireEvent.click(within(sheet).getByRole('button', { name: '휴게 추가' }));
    type(sheet, '휴게 2 시작', '22:00');
    type(sheet, '휴게 2 끝', '22:10');
    type(sheet, '고치는 이유 (기록에 남아요)', '휴게 끝을 늦게 눌렀어요');
    const loadsBefore = calls.filter((call) => call.method === 'GET').length;
    fireEvent.click(saveButton(sheet));

    expect(await screen.findByText('휴게를 고쳤어요')).toBeTruthy();
    expect(calls.find((call) => call.method === 'PUT')).toEqual({
      method: 'PUT',
      url: '/api/v1/attendances/a1/breaks',
      body: {
        breaks: [
          // 손대지 않은 시작은 초까지 그대로
          { startAt: '2026-11-02T11:00:40.000Z', endAt: '2026-11-02T11:30:00.000Z' },
          { startAt: '2026-11-02T13:00:00.000Z', endAt: '2026-11-02T13:10:00.000Z' },
        ],
        reason: '휴게 끝을 늦게 눌렀어요',
      },
    });
    await waitFor(() => expect(calls.filter((call) => call.method === 'GET').length).toBeGreaterThan(loadsBefore));
  });

  it('모두 지우면 빈 목록을 보내고 소정 휴게를 뺀다고 알려 준다', async () => {
    const calls = stubApi(DETAIL);
    const sheet = await openSheet();
    fireEvent.click(within(sheet).getByRole('button', { name: '휴게 1 지우기' }));
    expect(within(sheet).getByText('남긴 휴게가 없어요. 이대로 저장하면 근로조건의 휴게시간을 빼요.')).toBeTruthy();
    type(sheet, '고치는 이유 (기록에 남아요)', '잘못 누름');
    fireEvent.click(saveButton(sheet));
    await waitFor(() => expect(calls.find((call) => call.method === 'PUT')?.body).toEqual({ breaks: [], reason: '잘못 누름' }));
  });

  it('겹치거나 근무 밖인 휴게는 바로 안내하고 저장을 끈다', async () => {
    stubApi(DETAIL);
    const sheet = await openSheet();
    type(sheet, '고치는 이유 (기록에 남아요)', '고침');
    fireEvent.click(within(sheet).getByRole('button', { name: '휴게 추가' }));
    type(sheet, '휴게 2 시작', '20:10');
    type(sheet, '휴게 2 끝', '20:40');
    expect(within(sheet).getByRole('alert').textContent).toBe('휴게 시간이 서로 겹쳐요.');
    expect(saveButton(sheet).disabled).toBe(true);
    type(sheet, '휴게 2 시작', '23:10');
    type(sheet, '휴게 2 끝', '23:30');
    expect(within(sheet).getByRole('alert').textContent).toBe('휴게는 출근과 퇴근 사이로 넣어 주세요.');
  });

  it('서버가 거절하면 시트 안에 이유를 보여 준다', async () => {
    stubApi(DETAIL, { ok: false, body: { error: { code: 'CORRECTION_WINDOW_CLOSED', message: '35일이 지난 근무는 휴게를 고칠 수 없어요.' } } });
    const sheet = await openSheet();
    type(sheet, '휴게 1 끝', '20:30');
    type(sheet, '고치는 이유 (기록에 남아요)', '고침');
    fireEvent.click(saveButton(sheet));
    expect(await within(sheet).findByText('35일이 지난 근무는 휴게를 고칠 수 없어요.')).toBeTruthy();
  });

  it('변경 이력에 휴게를 고친 내용을 앞뒤로 보여 주고, 예전 이력은 근무 시각을 보여 준다', async () => {
    const snapshot = { clockInAt: DETAIL.clockInAt, clockOutAt: DETAIL.clockOutAt, status: 'CLOSED' as const, breakWaived: false };
    stubApi({
      ...DETAIL,
      revisions: [
        {
          id: 'r2', actorName: '김사장', reason: '휴게 고침', createdAt: '2026-11-03T00:00:00.000Z',
          before: { ...snapshot, breaks: [{ startAt: '2026-11-02T11:00:00.000Z', endAt: '2026-11-02T11:05:00.000Z' }] },
          after: { ...snapshot, breaks: [] },
        },
        { id: 'r1', actorName: '김사장', reason: '추가', createdAt: '2026-11-02T15:00:00.000Z', before: null, after: snapshot },
      ],
    });
    renderScreen();
    const section = await screen.findByRole('region', { name: '변경 이력' });
    expect(within(section).getByText('휴게 20:00~20:05 → 없음')).toBeTruthy();
    expect(within(section).getByText('없음 → 18:00 ~ 23:00')).toBeTruthy();
  });
});
