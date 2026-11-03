/** GET /me 응답. docs/specs/auth §8 */
export interface MeDto {
  user: { id: string; name: string | null; hasPhone: boolean };
  memberships: {
    storeId: string;
    storeName: string;
    role: 'OWNER' | 'MANAGER' | 'EMPLOYEE';
    status: 'ACTIVE' | 'INACTIVE';
  }[];
}

export interface SendOtpResultDto {
  expiresAt: string;
  /** 개발 환경(SMS_PROVIDER=dev)에서만 */
  devCode?: string;
}

export interface VerifyOtpResultDto {
  needsName: boolean;
}
