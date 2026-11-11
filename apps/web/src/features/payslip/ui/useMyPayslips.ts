'use client';

import type { MeDto } from '@/features/auth/model/me-types';
import { useApiResource } from '@/shared/lib/useApiResource';

import type { MyPayslipListItemDto } from '../model/payslip-types';

/** 직원 화면은 로그인 화면이 없다 (docs/specs/auth §1) */
const EMPLOYEE_OPTIONS = { loginPath: null } as const;

/** 직원 본인 명세서 목록 (SENT·SUPERSEDED, 최신순) — docs/specs/payslip §5.3. storeId 를 모르면 첫 활성 매장 */
export function useMyPayslips(storeIdParam?: string) {
  const me = useApiResource<MeDto>(storeIdParam ? null : '/api/v1/me', EMPLOYEE_OPTIONS);
  const memberships = me.data?.memberships ?? [];
  // 활성 매장 먼저, 없으면 퇴사한 매장 (INACTIVE 본인도 자기 명세서는 본다, §1-6)
  const storeId = storeIdParam ?? (memberships.find((membership) => membership.status === 'ACTIVE') ?? memberships[0])?.storeId ?? null;
  const list = useApiResource<{ items: MyPayslipListItemDto[] }>(storeId ? `/api/v1/attendance/me/payslips?storeId=${storeId}` : null, EMPLOYEE_OPTIONS);
  // 소속이 하나도 없으면 목록을 부를 수 없다. 빈 목록으로 본다
  const noStore = !storeIdParam && me.data !== null && storeId === null;
  return { storeId, items: noStore ? [] : (list.data?.items ?? null), errorMessage: list.errorMessage ?? me.errorMessage };
}
