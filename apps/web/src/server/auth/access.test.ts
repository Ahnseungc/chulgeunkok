import { describe, expect, it } from 'vitest';

import { canAccessStore } from './access';

describe('canAccessStore', () => {
  it('Owner는 급여를 볼 수 있다', () => {
    expect(canAccessStore({ role: 'OWNER', permissions: [] }, 'PAYROLL')).toBe(true);
  });

  it('권한 없는 Manager는 급여를 볼 수 없다', () => {
    expect(canAccessStore({ role: 'MANAGER', permissions: [] }, 'PAYROLL')).toBe(false);
  });

  it('PAYROLL_READ가 있는 Manager는 급여를 볼 수 있다', () => {
    expect(canAccessStore({ role: 'MANAGER', permissions: ['PAYROLL_READ'] }, 'PAYROLL')).toBe(
      true,
    );
  });

  it('PAYROLL_READ만 있는 Manager는 근로조건을 등록할 수 없다', () => {
    expect(
      canAccessStore({ role: 'MANAGER', permissions: ['PAYROLL_READ'] }, 'TERMS_WRITE'),
    ).toBe(false);
  });

  it('Employee는 권한 배열이 있어도 위임 권한을 쓰지 못한다', () => {
    expect(canAccessStore({ role: 'EMPLOYEE', permissions: ['PAYROLL_READ'] }, 'PAYROLL')).toBe(
      false,
    );
  });
});
