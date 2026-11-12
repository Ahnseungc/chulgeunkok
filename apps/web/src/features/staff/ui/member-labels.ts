import type { MemberPermission, MemberRole } from '../model/member-types';

export const ROLE_LABEL = {
  OWNER: '사장님',
  MANAGER: '매니저',
  EMPLOYEE: '직원',
} as const satisfies Record<MemberRole, string>;

/** 매니저에게 맡기는 권한. 이력 문구·역할 변경 화면이 같이 쓴다 (docs/specs/staff §4.2·§4.3) */
export const PERMISSION_LABEL = {
  PAYROLL_READ: '급여 보기',
  TERMS_EDIT: '근로조건 등록',
} as const satisfies Record<MemberPermission, string>;
