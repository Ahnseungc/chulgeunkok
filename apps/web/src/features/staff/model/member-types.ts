import type { TermsDto } from '@/features/labor/model/labor-types';

/** 직원 목록·상세. docs/specs/staff §5 */

export type MemberRole = 'OWNER' | 'MANAGER' | 'EMPLOYEE';

export interface MemberSummaryDto {
  memberId: string;
  name: string;
  role: MemberRole;
  status: 'ACTIVE' | 'INACTIVE';
  joinedAt: string;
  leftAt: string | null;
  isWorking: boolean;
  hasTerms: boolean;
  openReviewCount: number;
}

export interface MemberDetailDto extends MemberSummaryDto {
  permissions: ('PAYROLL_READ' | 'TERMS_EDIT')[];
  /** 지금 적용 중이거나 앞으로 적용될 최신 버전. 권한이 없으면 null */
  currentTerms: TermsDto | null;
  /** 조회한 사람이 근로조건을 볼·고칠 수 있는지 (화면 버튼 노출용) */
  canReadTerms: boolean;
  canEditTerms: boolean;
}
