'use client';

import { useState } from 'react';

import { apiFetch } from '@/shared/lib/api-client';
import { errorMessageOf } from '@/shared/lib/useApiResource';
import { useToast } from '@/shared/ui/useToast';

import type { AssignableRole, MemberPermission } from '../model/member-types';
import type { UpdateMemberInput } from '../schema';

/** 화면에 보이는 순서이자 보내는 순서 */
export const PERMISSION_ORDER = ['PAYROLL_READ', 'TERMS_EDIT'] as const satisfies readonly MemberPermission[];

export interface RoleSelection {
  role: AssignableRole;
  permissions: readonly MemberPermission[];
}

export const togglePermission = (permissions: readonly MemberPermission[], target: MemberPermission): MemberPermission[] =>
  PERMISSION_ORDER.filter((permission) => (permission === target) !== permissions.includes(permission));

/** 위임 권한은 매니저에게만 의미가 있다. 직원으로 내리면 비워 보낸다 (서버도 비운다, docs/specs/staff §4.2) */
export const toUpdateMemberBody = ({ role, permissions }: RoleSelection): UpdateMemberInput => ({
  role,
  permissions: role === 'MANAGER' ? [...permissions] : [],
});

export const isRoleUnchanged = (saved: RoleSelection, draft: RoleSelection) => {
  const [before, after] = [toUpdateMemberBody(saved), toUpdateMemberBody(draft)];
  return before.role === after.role && before.permissions?.join() === after.permissions?.join();
};

/** 직원 상세 "역할·권한" — 고른 값을 PATCH 하고, 성공하면 토스트 후 상세를 다시 부른다 */
export function useMemberRole(input: { memberPath: string; saved: RoleSelection; onSaved: () => void }) {
  const toast = useToast();
  const [draft, setDraft] = useState<RoleSelection>(input.saved);
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const save = async () => {
    setPending(true);
    setErrorMessage(null);
    try {
      await apiFetch(input.memberPath, { method: 'PATCH', body: JSON.stringify(toUpdateMemberBody(draft)) });
      toast.success('역할·권한을 바꿨어요');
      input.onSaved();
    } catch (error) {
      setErrorMessage(errorMessageOf(error));
    } finally {
      setPending(false);
    }
  };

  return {
    draft,
    pending,
    errorMessage,
    unchanged: isRoleUnchanged(input.saved, draft),
    selectRole: (role: AssignableRole) => setDraft((current) => ({ ...current, role })),
    togglePermission: (permission: MemberPermission) =>
      setDraft((current) => ({ ...current, permissions: togglePermission(current.permissions, permission) })),
    save,
  };
}
