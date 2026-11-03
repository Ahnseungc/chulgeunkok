import { describe, expect, it } from 'vitest';

import { isValidBusinessNumber, normalizeBusinessNumber } from './business-number';

describe('normalizeBusinessNumber', () => {
  it('하이픈을 지운다', () => {
    expect(normalizeBusinessNumber('123-45-67891')).toBe('1234567891');
  });

  it('10자리가 아니면 null', () => {
    expect(normalizeBusinessNumber('123-45-6789')).toBeNull();
  });
});

describe('isValidBusinessNumber', () => {
  it('체크섬이 맞으면 true', () => {
    expect(isValidBusinessNumber('1234567891')).toBe(true);
  });

  it('마지막 자리가 틀리면 false', () => {
    expect(isValidBusinessNumber('1234567890')).toBe(false);
  });
});
