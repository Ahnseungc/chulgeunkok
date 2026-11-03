import { describe, expect, it } from 'vitest';

import { KoreanMobilePhone } from './common';

describe('KoreanMobilePhone', () => {
  it('하이픈 있는 번호를 E.164로 바꾼다', () => {
    expect(KoreanMobilePhone.parse('010-1234-5678')).toBe('+821012345678');
  });

  it('유선 번호는 실패한다', () => {
    expect(KoreanMobilePhone.safeParse('02-123-4567').success).toBe(false);
  });
});
