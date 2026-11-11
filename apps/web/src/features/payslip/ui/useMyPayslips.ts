'use client';

import type { MeDto } from '@/features/auth/model/me-types';
import { useApiResource } from '@/shared/lib/useApiResource';

import type { MyPayslipListItemDto } from '../model/payslip-types';

/** 직원 화면은 로그인 화면이 없다 (docs/specs/auth §1) */
const EMPLOYEE_OPTIONS = { loginPath: null } as const;

/** 직원 본인 명세서 목록 (SENT·SUPERSEDED, 최신순) — docs/specs/payslip §5.3. storeId 를 모르면 첫 활성 매장 */
export function useMyPayslips(storeIdParam?: string) {
  const me = useApiResource<MeDto>(storeIdParam ? null : '/api/v1/me', EMPLOYEE_OPTIONS);
  const storeId = storeIdParam ?? me.data?.memberships.find((membership) => membership.status === 'ACTIVE')?.storeId ?? null;
  const list = useApiResource<MyPayslipListItemDto[]>(storeId ? `/api/v1/attendance/me/payslips?storeId=${storeId}` : null, EMPLOYEE_OPTIONS);
  return { storeId, items: list.data, errorMessage: list.errorMessage ?? me.errorMessage };
}
