import type { Permission, Role } from '@chulgeunkok/db';

/**
 * 매장 단위 동작별 접근 규칙. 정본: docs/specs/README.md §2.5
 * - `roles`: 이 역할이면 허용
 * - `managerPermissions`: MANAGER가 이 권한 중 하나라도 있으면 허용
 * 본인 데이터 접근(직원이 자기 근태 조회 등)은 각 핸들러에서 따로 확인한다.
 */
export const STORE_ACCESS_RULES = {
  STORE_ADMIN: { roles: ['OWNER'], managerPermissions: [] },
  MEMBER_ADMIN: { roles: ['OWNER'], managerPermissions: [] },
  INVITE: { roles: ['OWNER', 'MANAGER'], managerPermissions: [] },
  ATTENDANCE_ADMIN: { roles: ['OWNER', 'MANAGER'], managerPermissions: [] },
  DASHBOARD: { roles: ['OWNER', 'MANAGER'], managerPermissions: [] },
  TERMS_READ: { roles: ['OWNER'], managerPermissions: ['PAYROLL_READ', 'TERMS_EDIT'] },
  TERMS_WRITE: { roles: ['OWNER'], managerPermissions: ['TERMS_EDIT'] },
  LABOR_REVIEW: { roles: ['OWNER'], managerPermissions: ['PAYROLL_READ', 'TERMS_EDIT'] },
  PAYROLL: { roles: ['OWNER'], managerPermissions: ['PAYROLL_READ'] },
  PAYSLIP_WRITE: { roles: ['OWNER'], managerPermissions: [] },
  MEMBER: { roles: ['OWNER', 'MANAGER', 'EMPLOYEE'], managerPermissions: [] },
} as const satisfies Record<
  string,
  { roles: readonly Role[]; managerPermissions: readonly Permission[] }
>;

export type StoreAction = keyof typeof STORE_ACCESS_RULES;

export function canAccessStore(
  membership: { role: Role; permissions: readonly Permission[] },
  action: StoreAction,
): boolean {
  const rule = STORE_ACCESS_RULES[action];
  if ((rule.roles as readonly Role[]).includes(membership.role)) return true;
  if (membership.role !== 'MANAGER') return false;
  return rule.managerPermissions.some((permission) =>
    membership.permissions.includes(permission),
  );
}

/**
 * 급여 권한을 위임받은 Manager는 휴대폰 인증(User.phone)까지 해야 급여를 본다 (docs/specs/auth §4.2, 인덱스 Q8).
 * 사장님은 휴대폰 인증으로만 기기를 등록하므로 따로 묻지 않는다.
 */
export function needsVerifiedPhone(membership: { role: Role }, action: StoreAction): boolean {
  return action === 'PAYROLL' && membership.role === 'MANAGER';
}
