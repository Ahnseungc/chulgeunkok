/**
 * API 에러 코드 정본. 문구는 사용자에게 그대로 노출한다.
 * 근거: docs/specs/README.md §2.4 + 각 도메인 스펙 "에러 코드" 절
 */
export const ERROR_CODES = {
  // 공통
  UNAUTHENTICATED: { status: 401, message: '로그인이 필요해요.' },
  PROFILE_INCOMPLETE: { status: 403, message: '이름과 휴대폰 인증을 먼저 완료해 주세요.' },
  FORBIDDEN: { status: 403, message: '권한이 없어요.' },
  NOT_FOUND: { status: 404, message: '찾을 수 없어요.' },
  VALIDATION_FAILED: { status: 400, message: '입력값을 확인해 주세요.' },
  CONFLICT: { status: 409, message: '다른 변경과 충돌했어요. 다시 시도해 주세요.' },
  RATE_LIMITED: { status: 429, message: '잠시 후 다시 시도해 주세요.' },
  INTERNAL: { status: 500, message: '일시적인 오류가 발생했어요.' },
  NOT_IMPLEMENTED: { status: 501, message: '아직 준비 중인 기능이에요.' },

  // auth
  OTP_INVALID: { status: 400, message: '인증번호가 맞지 않아요.' },
  OTP_EXPIRED: { status: 410, message: '인증번호가 만료됐어요. 다시 받아 주세요.' },
  OTP_TOO_MANY_ATTEMPTS: {
    status: 429,
    message: '시도 횟수를 넘었어요. 인증번호를 다시 받아 주세요.',
  },
  OTP_RESEND_TOO_SOON: { status: 429, message: '잠시 후 다시 요청해 주세요.' },
  PHONE_INVALID: { status: 400, message: '휴대폰 번호를 확인해 주세요.' },

  // store
  STORE_LIMIT_REACHED: { status: 409, message: '매장은 10개까지 만들 수 있어요.' },
  HEADCOUNT_DATE_OUT_OF_RANGE: {
    status: 400,
    message: '최근 90일 안의 날짜만 선택할 수 있어요.',
  },

  // staff
  INVITATION_INVALID: { status: 404, message: '초대 링크를 찾을 수 없어요.' },
  INVITATION_EXPIRED: {
    status: 410,
    message: '초대 링크가 만료됐어요. 사장님께 새 링크를 요청해 주세요.',
  },
  INVITATION_USED: { status: 409, message: '이미 사용한 초대 링크예요.' },
  INVITATION_PHONE_MISMATCH: { status: 403, message: '초대받은 휴대폰 번호로 로그인해 주세요.' },
  ALREADY_MEMBER: { status: 409, message: '이미 이 매장 직원이에요.' },
  CANNOT_DEACTIVATE_OWNER: { status: 409, message: '사장님 계정은 비활성화할 수 없어요.' },
  MEMBER_HAS_OPEN_ATTENDANCE: {
    status: 409,
    message: '근무 중인 직원이에요. 퇴근 처리 후 비활성화해 주세요.',
  },

  // labor
  MINIMUM_WAGE_CONFIRM_REQUIRED: {
    status: 409,
    message: '최저임금보다 낮은 시급이에요. 그래도 저장할까요?',
  },
  TERMS_EFFECTIVE_BEFORE_CURRENT: {
    status: 409,
    message: '현재 근로조건 시작일보다 이전 날짜로는 바꿀 수 없어요.',
  },
  TERMS_OVERLAP: { status: 409, message: '근로조건 기간이 겹쳐요. 다시 시도해 주세요.' },
  LABOR_REVIEW_STATUS_INVALID: {
    status: 409,
    message: '이미 정리된 항목은 확인 처리할 수 없어요.',
  },

  // attendance
  QR_TOKEN_INVALID: { status: 404, message: 'QR을 확인할 수 없어요.' },
  QR_TOKEN_REVOKED: {
    status: 410,
    message: '새 QR로 바뀌었어요. 매장에 붙은 최신 QR을 찍어 주세요.',
  },
  NOT_STORE_MEMBER: {
    status: 403,
    message: '이 매장 직원이 아니에요. 사장님께 초대를 요청해 주세요.',
  },
  TERMS_NOT_SET: {
    status: 409,
    message: '근로조건이 아직 등록되지 않았어요. 사장님께 알려 주세요.',
  },
  PUNCH_ACTION_MISMATCH: {
    status: 409,
    message: '이미 다른 기기에서 기록됐어요. 다시 확인해 주세요.',
  },
  PUNCH_TOO_SOON: { status: 409, message: '방금 출근했어요. 1분 뒤에 퇴근할 수 있어요.' },
  IDEMPOTENCY_KEY_REUSED: { status: 422, message: '요청을 다시 시작해 주세요.' },
  CORRECTION_PENDING_EXISTS: { status: 409, message: '이미 처리 중인 수정 요청이 있어요.' },
  CORRECTION_WINDOW_CLOSED: {
    status: 409,
    message: '35일이 지난 기록은 사장님께 직접 수정을 요청해 주세요.',
  },
  ATTENDANCE_NOT_EDITABLE: { status: 409, message: '지금 상태에서는 이 요청을 할 수 없어요.' },
  ATTENDANCE_CONFLICT: { status: 409, message: '다른 근무 기록과 겹쳐요.' },

  // payroll
  PAY_PERIOD_INVALID: { status: 400, message: '정산 기간 시작일이 맞지 않아요.' },
  PAY_PERIOD_IN_FUTURE: { status: 400, message: '아직 시작하지 않은 기간이에요.' },
} as const satisfies Record<string, { status: number; message: string }>;

export type ErrorCode = keyof typeof ERROR_CODES;
