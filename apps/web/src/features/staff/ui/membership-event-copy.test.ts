import { describe, expect, it } from 'vitest';

import { describeMembershipEvent } from './membership-event-copy';

describe('describeMembershipEvent', () => {
  it('역할 변경은 이전·이후 역할 이름으로', () => {
    expect(
      describeMembershipEvent({ type: 'ROLE_CHANGED', before: { role: 'EMPLOYEE' }, after: { role: 'MANAGER' } }),
    ).toBe('역할을 직원에서 매니저로 바꿨어요');
  });

  it('권한을 모두 빼면 없음으로', () => {
    expect(
      describeMembershipEvent({
        type: 'PERMISSIONS_CHANGED',
        before: { permissions: ['PAYROLL_READ', 'TERMS_EDIT'] },
        after: { permissions: [] },
      }),
    ).toBe('맡긴 권한: 급여 보기, 근로조건 등록 → 없음');
  });
});
