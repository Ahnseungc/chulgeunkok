import type { MemberRole } from '../model/member-types';

export const ROLE_LABEL = {
  OWNER: '사장님',
  MANAGER: '매니저',
  EMPLOYEE: '직원',
} as const satisfies Record<MemberRole, string>;
