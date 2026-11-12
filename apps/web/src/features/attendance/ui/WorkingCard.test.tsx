/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import ToastProvider from '@/shared/ui/Toast';

import WorkingCard from './WorkingCard';

const SERVER_NOW = '2026-11-10T10:00:00.000Z'; // 19:00 KST
const WORKING = { attendanceId: 'a1', clockInAt: '2026-11-10T09:00:00.000Z', breakStartedAt: null };

interface FetchCall {
  url: string;
  body: unknown;
}

// Seed ActionButton 의 눌림 피드백이 ResizeObserver 를 쓴다. jsdom 엔 없어서 빈 구현을 둔다
const stubResizeObserver = () =>
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );

const stubApi = (response: { ok: boolean; body: unknown }) => {
  stubResizeObserver();
  const calls: FetchCall[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url, body: init.body ? JSON.parse(String(init.body)) : null });
      return { ok: response.ok, status: response.ok ? 200 : 409, json: async () => response.body };
    }),
  );
  return calls;
};

const renderCard = (working: typeof WORKING | (Omit<typeof WORKING, 'breakStartedAt'> & { breakStartedAt: string })) => {
  const onChanged = vi.fn(async () => {});
  render(
    <ToastProvider>
      <WorkingCard storeId="s1" storeName="골목카페" working={working} serverNow={SERVER_NOW} onChanged={onChanged} />
    </ToastProvider>,
  );
  return onChanged;
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('WorkingCard 휴게 버튼 (attendance §3.6)', () => {
  it('휴게 중이 아니면 "휴게 시작"을 누르면 시작을 보내고 토스트·다시 조회', async () => {
    const calls = stubApi({ ok: true, body: { attendanceId: 'a1', break: { id: 'b1', startAt: SERVER_NOW, endAt: null } } });
    const onChanged = renderCard(WORKING);
    fireEvent.click(screen.getByRole('button', { name: '휴게 시작' }));
    expect(await screen.findByText('휴게를 시작했어요')).toBeTruthy();
    expect(calls).toEqual([{ url: '/api/v1/attendance/break/start', body: { storeId: 's1' } }]);
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
  });

  it('휴게 중이면 경과 시간과 "휴게 끝"을 보여 주고, 누르면 끝을 보낸다', async () => {
    const calls = stubApi({
      ok: true,
      body: { attendanceId: 'a1', break: { id: 'b1', startAt: '2026-11-10T09:48:00.000Z', endAt: SERVER_NOW } },
    });
    renderCard({ ...WORKING, breakStartedAt: '2026-11-10T09:48:00.000Z' });
    expect(screen.getByText('휴게 중 · 12분')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '휴게 시작' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '휴게 끝' }));
    expect(await screen.findByText('휴게 12분을 남겼어요')).toBeTruthy();
    expect(calls.map((call) => call.url)).toEqual(['/api/v1/attendance/break/end']);
  });

  it('실패하면 서버 문구로 오류 토스트를 띄우고 다시 조회한다', async () => {
    stubApi({ ok: false, body: { error: { code: 'BREAK_NOT_STARTED', message: '시작한 휴게가 없어요.' } } });
    const onChanged = renderCard({ ...WORKING, breakStartedAt: '2026-11-10T09:48:00.000Z' });
    fireEvent.click(screen.getByRole('button', { name: '휴게 끝' }));
    expect(await screen.findByText('시작한 휴게가 없어요.')).toBeTruthy();
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
  });
});
