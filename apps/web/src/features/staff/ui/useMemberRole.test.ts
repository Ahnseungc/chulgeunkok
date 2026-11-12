import { describe, expect, it } from 'vitest';

import { isRoleUnchanged, togglePermission, toUpdateMemberBody } from './useMemberRole';

describe('togglePermission', () => {
  it('켜고 끄며, 순서는 급여 보기 → 근로조건 등록으로 맞춘다', () => {
    expect(togglePermission(['TERMS_EDIT'], 'PAYROLL_READ')).toEqual(['PAYROLL_READ', 'TERMS_EDIT']);
    expect(togglePermission(['PAYROLL_READ', 'TERMS_EDIT'], 'PAYROLL_READ')).toEqual(['TERMS_EDIT']);
  });
});

describe('toUpdateMemberBody', () => {
  it('직원으로 내리면 권한을 비워 보낸다 (서버도 비운다, staff §4.2)', () => {
    expect(toUpdateMemberBody({ role: 'EMPLOYEE', permissions: ['PAYROLL_READ'] })).toEqual({ role: 'EMPLOYEE', permissions: [] });
  });

  it('매니저면 고른 권한 그대로', () => {
    expect(toUpdateMemberBody({ role: 'MANAGER', permissions: ['TERMS_EDIT'] })).toEqual({ role: 'MANAGER', permissions: ['TERMS_EDIT'] });
  });
});

describe('isRoleUnchanged', () => {
  it('직원은 남아 있는 권한 선택과 상관없이 역할만 본다', () => {
    const saved = { role: 'EMPLOYEE', permissions: [] } as const;
    expect(isRoleUnchanged(saved, { role: 'EMPLOYEE', permissions: ['PAYROLL_READ'] })).toBe(true);
    expect(isRoleUnchanged(saved, { role: 'MANAGER', permissions: [] })).toBe(false);
  });

  it('매니저는 권한까지 같아야 그대로다', () => {
    const saved = { role: 'MANAGER', permissions: ['PAYROLL_READ'] } as const;
    expect(isRoleUnchanged(saved, { role: 'MANAGER', permissions: ['PAYROLL_READ'] })).toBe(true);
    expect(isRoleUnchanged(saved, { role: 'MANAGER', permissions: [] })).toBe(false);
  });
});
