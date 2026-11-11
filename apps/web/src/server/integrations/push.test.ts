import { afterEach, describe, expect, it, vi } from 'vitest';

const send = vi.fn();

vi.mock('firebase-admin/app', () => ({
  cert: (account: unknown) => account,
  getApps: () => [],
  initializeApp: () => ({}),
}));
vi.mock('firebase-admin/messaging', () => ({ getMessaging: () => ({ send }) }));

const MESSAGE = { title: '11월 임금명세서가 도착했어요', body: '골목카페', path: '/me/payslips/p1' };

const loadSender = async (provider: string) => {
  vi.stubEnv('PUSH_PROVIDER', provider);
  vi.stubEnv('FIREBASE_SERVICE_ACCOUNT', '{"project_id":"test"}');
  vi.resetModules();
  const { getPushSender } = await import('./push');
  return getPushSender();
};

afterEach(() => {
  vi.unstubAllEnvs();
  send.mockReset();
});

describe('getPushSender', () => {
  it('dev 발송기는 로그만 남기고 SENT', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    expect(await (await loadSender('dev')).send('token', MESSAGE)).toBe('SENT');
    expect(send).not.toHaveBeenCalled();
    info.mockRestore();
  });

  it('fcm은 notification과 data.path로 보낸다', async () => {
    send.mockResolvedValue('message-id');
    expect(await (await loadSender('fcm')).send('token', MESSAGE)).toBe('SENT');
    expect(send).toHaveBeenCalledWith({
      token: 'token',
      notification: { title: MESSAGE.title, body: MESSAGE.body },
      data: { path: MESSAGE.path },
    });
  });

  it('등록 해제된 토큰은 TOKEN_INVALID, 그 밖의 오류는 던진다', async () => {
    const sender = await loadSender('fcm');
    send.mockRejectedValueOnce({ code: 'messaging/registration-token-not-registered' });
    expect(await sender.send('token', MESSAGE)).toBe('TOKEN_INVALID');
    send.mockRejectedValueOnce({ code: 'messaging/internal-error' });
    await expect(sender.send('token', MESSAGE)).rejects.toMatchObject({ code: 'messaging/internal-error' });
  });
});
