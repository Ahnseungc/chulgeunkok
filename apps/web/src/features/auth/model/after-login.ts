/** 휴대폰 인증 뒤 돌아갈 사장님 화면 (docs/specs/auth §4.2). 오픈 리다이렉트를 막으려고 `/owner` 아래 경로만 받는다 */
const AFTER_LOGIN_PATTERN = /^\/owner(\/[A-Za-z0-9_\-/]*)?$/;
export const DEFAULT_AFTER_LOGIN_PATH = '/owner';

export function afterLoginPath(next: string | null | undefined): string {
  return next && AFTER_LOGIN_PATTERN.test(next) && !next.includes('//') ? next : DEFAULT_AFTER_LOGIN_PATH;
}

/** 급여 화면에서 인증을 마치고 그 화면으로 돌아오는 주소 */
export function phoneVerificationPath(returnTo: string): string {
  return `/owner/login?verify=1&next=${encodeURIComponent(afterLoginPath(returnTo))}`;
}

/** 서버가 급여 권한 Manager에게 휴대폰 인증을 요구할 때의 코드 (auth §9) */
export const PHONE_VERIFICATION_REQUIRED = 'PHONE_VERIFICATION_REQUIRED';
