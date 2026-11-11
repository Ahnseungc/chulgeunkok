import { describe, expect, it } from 'vitest';

import { parseAppToWeb, parseWebToApp, toAppPath, toPushPath } from './index';

const ORIGIN = 'https://chulgeunkok.app';
const TOKEN = 'a'.repeat(43);

describe('toAppPath', () => {
  it.each([
    [`${ORIGIN}/p/${TOKEN}`, `/p/${TOKEN}`],
    [`${ORIGIN}/invite/${TOKEN}`, `/invite/${TOKEN}`],
    [`chulgeunkok://p/${TOKEN}`, `/p/${TOKEN}`],
  ])('%s → %s', (url, path) => {
    expect(toAppPath(url, ORIGIN)).toBe(path);
  });

  it.each([
    [`https://evil.example/p/${TOKEN}`, '다른 출처'],
    [`${ORIGIN}/owner`, '앱 경로가 아님'],
    [`${ORIGIN}/p/../owner`, '경로 조작'],
    ['그냥 글자', 'URL 아님'],
    [`javascript:alert(1)`, '스크립트'],
  ])('%s 는 거부 (%s)', (url) => {
    expect(toAppPath(url, ORIGIN)).toBeNull();
  });
});

describe('parseWebToApp', () => {
  it('알려진 메시지만 받는다', () => {
    expect([
      parseWebToApp('{"type":"OPEN_SCANNER"}'),
      parseWebToApp('{"type":"DELETE_EVERYTHING"}'),
      parseWebToApp(JSON.stringify({ type: 'DEVICE_REGISTERED', handoffCode: 'short' })),
      parseWebToApp('not json'),
    ]).toEqual([{ type: 'OPEN_SCANNER' }, null, null, null]);
  });
});

describe('위치 요청·응답', () => {
  const requestId = '0f8c2a4e-1b2c-4d5e-8f90-123456789abc';

  it('REQUEST_LOCATION 은 requestId 가 있어야 한다', () => {
    expect([
      parseWebToApp(JSON.stringify({ type: 'REQUEST_LOCATION', requestId })),
      parseWebToApp(JSON.stringify({ type: 'REQUEST_LOCATION' })),
      parseWebToApp(JSON.stringify({ type: 'REQUEST_LOCATION', requestId: '<script>' })),
    ]).toEqual([{ type: 'REQUEST_LOCATION', requestId }, null, null]);
  });

  it('LOCATION 은 좌표 또는 실패 사유를 받는다 (문자열·객체 모두)', () => {
    const coords = { latitude: 37.5, longitude: 127.03, accuracy: 12.4 };
    expect(parseAppToWeb(JSON.stringify({ type: 'LOCATION', requestId, coords }))).toEqual({ type: 'LOCATION', requestId, coords });
    expect(parseAppToWeb({ type: 'LOCATION', requestId, error: 'DENIED' })).toEqual({ type: 'LOCATION', requestId, error: 'DENIED' });
    expect(parseAppToWeb({ type: 'LOCATION', requestId, error: 'UNAVAILABLE' })).toEqual({
      type: 'LOCATION',
      requestId,
      error: 'UNAVAILABLE',
    });
  });

  it.each([
    [{ type: 'LOCATION', requestId }, '좌표·사유 없음'],
    [{ type: 'LOCATION', coords: { latitude: 0, longitude: 0, accuracy: 1 } }, 'requestId 없음'],
    [{ type: 'LOCATION', requestId, coords: { latitude: 91, longitude: 0, accuracy: 1 } }, '위도 범위 밖'],
    [{ type: 'LOCATION', requestId, coords: { latitude: 0, longitude: 0, accuracy: -1 } }, '정확도 음수'],
    [{ type: 'LOCATION', requestId, error: 'TIMEOUT' }, '모르는 사유'],
    ['not json', 'JSON 아님'],
  ] as [unknown, string][])('%j 는 거부 (%s)', (raw) => {
    expect(parseAppToWeb(raw)).toBeNull();
  });
});

describe('toPushPath', () => {
  it.each(['/me', '/me/payslips/abc_DEF-123'])('%s 는 허용', (path) => {
    expect(toPushPath(path)).toBe(path);
  });

  it.each([
    '//evil.com',
    '/api/v1/auth/handoff',
    '/me/payslips/../../api',
    '/me/payslips/',
    '/me/payslips/a/b',
    '/me/payslips/a?x=1',
    'https://evil.com/me',
    '',
    42,
    null,
    undefined,
  ])('%j 는 거부', (raw) => {
    expect(toPushPath(raw)).toBeNull();
  });
});
