import type { MemberPermission, MembershipEventDto } from '../model/member-types';

import { ROLE_LABEL } from './member-labels';

/** docs/specs/staff §4.3 변경 이력 문구 */
const PERMISSION_LABEL = {
  PAYROLL_READ: '급여 보기',
  TERMS_EDIT: '근로조건 등록',
} as const satisfies Record<MemberPermission, string>;

const permissionText = (permissions: readonly MemberPermission[] = []) =>
  permissions.length === 0 ? '없음' : permissions.map((permission) => PERMISSION_LABEL[permission]).join(', ');

/** 이력 한 줄을 사장님이 읽는 문장으로 */
export function describeMembershipEvent(event: Pick<MembershipEventDto, 'type' | 'before' | 'after'>): string {
  switch (event.type) {
    case 'ROLE_CHANGED':
      return `역할을 ${ROLE_LABEL[event.before.role ?? 'EMPLOYEE']}에서 ${ROLE_LABEL[event.after.role ?? 'EMPLOYEE']}로 바꿨어요`;
    case 'PERMISSIONS_CHANGED':
      return `맡긴 권한: ${permissionText(event.before.permissions)} → ${permissionText(event.after.permissions)}`;
    case 'DEACTIVATED':
      return '퇴사 처리했어요';
    case 'REACTIVATED':
      return '다시 일하게 됐어요';
  }
}
