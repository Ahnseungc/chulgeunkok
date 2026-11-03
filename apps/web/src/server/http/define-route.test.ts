import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { ApiError } from './api-error';
import { defineRoute } from './define-route';

const noParams = { params: Promise.resolve({}) };

const post = (body: string, headers: Record<string, string> = {}) =>
  new NextRequest('http://localhost/api/v1/test', { method: 'POST', body, headers });

describe('defineRoute', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('세션이 없으면 401 UNAUTHENTICATED', async () => {
    const handler = defineRoute({}, async () => ({ ok: true }));
    const res = await handler(post('{}'), noParams);
    expect(res.status).toBe(401);
  });

  it('body 검증 실패는 400 VALIDATION_FAILED', async () => {
    const handler = defineRoute({ auth: 'public', body: z.object({ name: z.string() }) }, async () => ({}));
    const res = await handler(post('{"name":1}'), noParams);
    expect(await res.json()).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
  });

  it('JSON이 아닌 body는 400', async () => {
    const handler = defineRoute({ auth: 'public', body: z.object({}) }, async () => ({}));
    const res = await handler(post('not-json'), noParams);
    expect(res.status).toBe(400);
  });

  it('ApiError는 코드의 HTTP 상태로 응답한다', async () => {
    const handler = defineRoute({ auth: 'public' }, async () => {
      throw new ApiError('PUNCH_TOO_SOON');
    });
    const res = await handler(post('{}'), noParams);
    expect(res.status).toBe(409);
  });

  it('예상하지 못한 예외는 500 INTERNAL이고 내부 메시지를 노출하지 않는다', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const handler = defineRoute({ auth: 'public' }, async () => {
      throw new Error('db password=secret');
    });
    const res = await handler(post('{}'), noParams);
    expect(JSON.stringify(await res.json())).not.toContain('secret');
  });

  it('DEV_AUTH=1이면 x-dev-user-id를 사용자로 쓴다', async () => {
    vi.stubEnv('DEV_AUTH', '1');
    const handler = defineRoute({}, async ({ userId }) => ({ userId }));
    const res = await handler(post('{}', { 'x-dev-user-id': 'u1' }), noParams);
    expect(await res.json()).toEqual({ userId: 'u1' });
  });

  it('production에서는 DEV_AUTH=1이어도 x-dev-user-id를 무시한다', async () => {
    vi.stubEnv('DEV_AUTH', '1');
    vi.stubEnv('NODE_ENV', 'production');
    const handler = defineRoute({}, async ({ userId }) => ({ userId }));
    const res = await handler(post('{}', { 'x-dev-user-id': 'u1' }), noParams);
    expect(res.status).toBe(401);
  });
});
