'use client';

import { ActionButton, Text } from '@seed-design/react';

import InlineAlert from '@/shared/ui/InlineAlert';

import type { AssignableRole, MemberPermission } from '../model/member-types';

import { PERMISSION_LABEL, ROLE_LABEL } from './member-labels';
import { PERMISSION_ORDER, useMemberRole } from './useMemberRole';

const ASSIGNABLE_ROLES = ['EMPLOYEE', 'MANAGER'] as const satisfies readonly AssignableRole[];

const ROLE_HINT = {
  EMPLOYEE: '출퇴근하고 본인 근무 기록과 임금명세서를 봐요.',
  MANAGER: '직원 출퇴근 기록을 고치고 새 직원을 등록해요.',
} as const satisfies Record<AssignableRole, string>;

const PERMISSION_HINT = {
  PAYROLL_READ: '정산·임금명세서와 직원 시급을 봐요. 처음 볼 때 휴대폰 인증을 해요.',
  TERMS_EDIT: '직원 시급과 근무 일정을 등록하고 고쳐요.',
} as const satisfies Record<MemberPermission, string>;

interface MemberRoleSectionProps {
  memberPath: string;
  role: AssignableRole;
  permissions: readonly MemberPermission[];
  onSaved: () => void;
}

/** 직원 상세 "역할·권한" — 사장님만, 재직 중인 직원·매니저 (docs/specs/staff §4.2·§5.2) */
export default function MemberRoleSection({ memberPath, role, permissions, onSaved }: MemberRoleSectionProps) {
  const form = useMemberRole({ memberPath, saved: { role, permissions }, onSaved });
  const { draft } = form;

  return (
    <section className="detail-section" aria-labelledby="role-heading">
      <Text as="h2" id="role-heading" textStyle="t6Bold">
        역할·권한
      </Text>
      <div className="segmented" role="group" aria-label="역할">
        {ASSIGNABLE_ROLES.map((value) => (
          <ActionButton
            key={value}
            size="small"
            variant={draft.role === value ? 'neutralSolid' : 'neutralWeak'}
            aria-pressed={draft.role === value}
            onClick={() => form.selectRole(value)}
          >
            {ROLE_LABEL[value]}
          </ActionButton>
        ))}
      </div>
      <Text as="p" textStyle="t4Regular" color="fg.neutralMuted">
        {ROLE_HINT[draft.role]}
      </Text>
      {draft.role === 'MANAGER' ? (
        <div className="permission-list" role="group" aria-label="맡길 일">
          {PERMISSION_ORDER.map((permission) => (
            <label key={permission} className="checkbox-row checkbox-row--top">
              <input
                type="checkbox"
                checked={draft.permissions.includes(permission)}
                onChange={() => form.togglePermission(permission)}
              />
              <span className="checkbox-row__text">
                <Text as="span" textStyle="t5Regular">
                  {PERMISSION_LABEL[permission]}
                </Text>
                <Text as="span" textStyle="t4Regular" color="fg.neutralMuted">
                  {PERMISSION_HINT[permission]}
                </Text>
              </span>
            </label>
          ))}
        </div>
      ) : null}
      <InlineAlert message={form.errorMessage} textStyle="t4Regular" />
      <ActionButton
        variant="neutralWeak"
        size="medium"
        disabled={form.unchanged}
        loading={form.pending}
        onClick={() => void form.save()}
      >
        저장
      </ActionButton>
    </section>
  );
}
