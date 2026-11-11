import { describe, expect, it } from 'vitest';

import { UpdateStoreBody } from './schema';

describe('UpdateStoreBody 급여 지급일', () => {
  it('1~31일과 null(지우기)을 받는다', () => {
    expect([1, 31, null].map((payDay) => UpdateStoreBody.safeParse({ payDay }).success)).toEqual([true, true, true]);
  });

  it('범위 밖이나 소수는 거부한다', () => {
    expect([0, 32, 10.5].map((payDay) => UpdateStoreBody.safeParse({ payDay }).success)).toEqual([false, false, false]);
  });
});
