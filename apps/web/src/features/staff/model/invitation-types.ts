/** 서버·클라이언트 공용 초대 타입. docs/specs/staff §3 */

export interface InvitationInfoDto {
  kind: 'JOIN' | 'REREGISTER';
  storeName: string;
  inviterName: string;
  role: 'OWNER' | 'MANAGER' | 'EMPLOYEE';
  /** REREGISTER 대상 직원 이름 */
  memberName: string | null;
  /** JOIN이고 이 기기가 아직 등록되지 않았을 때 true */
  needsName: boolean;
  expiresAt: string;
}

export interface AcceptInvitationResultDto {
  storeId: string;
  storeName: string;
  role: 'OWNER' | 'MANAGER' | 'EMPLOYEE';
}

export interface CreateInvitationResultDto {
  url: string;
  expiresAt: string;
}
