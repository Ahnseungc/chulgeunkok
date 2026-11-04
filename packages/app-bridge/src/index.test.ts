import { describe, expect, it } from 'vitest';

import { parseWebToApp, toAppPath } from './index';

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
