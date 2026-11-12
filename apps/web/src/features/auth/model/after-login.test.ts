import { describe, expect, it } from 'vitest';

import { afterLoginPath, phoneVerificationPath } from './after-login';

describe('afterLoginPath', () => {
  it('사장님 화면 경로만 돌려준다', () => {
    expect(afterLoginPath('/owner/s1/payroll')).toBe('/owner/s1/payroll');
  });

  it.each([null, '', 'https://evil.test', '//evil.test', '/owner//evil', '/me', '/owner/s1?x=1'])('%s 는 /owner 로', (next) => {
    expect(afterLoginPath(next)).toBe('/owner');
  });
});

describe('phoneVerificationPath', () => {
  it('인증 모드로 열고 돌아올 경로를 붙인다', () => {
    expect(phoneVerificationPath('/owner/s1/payslips')).toBe('/owner/login?verify=1&next=%2Fowner%2Fs1%2Fpayslips');
  });
});
