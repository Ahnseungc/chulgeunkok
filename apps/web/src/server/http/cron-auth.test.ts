import { describe, expect, it } from 'vitest';

import { isAuthorizedCronRequest } from './cron-auth';

describe('isAuthorizedCronRequest', () => {
  it('맞는 비밀값이면 통과', () => {
    expect(isAuthorizedCronRequest('Bearer s3cret', 's3cret')).toBe(true);
  });

  it('다르거나 길이가 다르면 거부', () => {
    expect([isAuthorizedCronRequest('Bearer s3crex', 's3cret'), isAuthorizedCronRequest('Bearer s3', 's3cret')]).toEqual([false, false]);
  });

  it('비밀값이 설정되지 않았으면 항상 거부', () => {
    expect(isAuthorizedCronRequest('Bearer ', '')).toBe(false);
  });

  it('헤더가 없으면 거부', () => {
    expect(isAuthorizedCronRequest(null, 's3cret')).toBe(false);
  });
});
