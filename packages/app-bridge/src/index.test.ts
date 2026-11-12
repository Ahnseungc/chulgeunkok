import { describe, expect, it } from 'vitest';

import { parseAppToWeb, parseWebToApp, SAVE_FILE_MAX_BASE64_LENGTH, toAppPath, toPushPath } from './index';

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

describe('파일 저장 SAVE_FILE', () => {
  const message = (overrides: Record<string, unknown> = {}) =>
    JSON.stringify({ type: 'SAVE_FILE', fileName: '출근콕-QR카드-골목카페-스탠드.pdf', mime: 'application/pdf', base64: 'JVBERi0=', ...overrides });

  it('파일 이름·형식·base64 가 맞으면 받는다', () => {
    expect(parseWebToApp(message())).toEqual({
      type: 'SAVE_FILE',
      fileName: '출근콕-QR카드-골목카페-스탠드.pdf',
      mime: 'application/pdf',
      base64: 'JVBERi0=',
    });
    expect(parseWebToApp(message({ mime: 'image/png', fileName: 'card.png' }))?.type).toBe('SAVE_FILE');
  });

  it.each(['../evil.pdf', 'a/b.pdf', 'a\\b.pdf', '..', '', 'a\nb.pdf'])('경로가 섞인 파일 이름 %j 은 버린다', (fileName) => {
    expect(parseWebToApp(message({ fileName }))).toBeNull();
  });

  it('허용하지 않은 형식·base64 아닌 값·상한을 넘는 본문은 버린다', () => {
    expect(parseWebToApp(message({ mime: 'text/html' }))).toBeNull();
    expect(parseWebToApp(message({ base64: 'not base64!' }))).toBeNull();
    expect(parseWebToApp(message({ base64: 'A'.repeat(SAVE_FILE_MAX_BASE64_LENGTH + 4) }))).toBeNull();
  });
});
