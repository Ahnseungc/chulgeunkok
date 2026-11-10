/**
 * 개발 전용 화면 목록 (/dev). `pnpm db:dev` 데모 데이터(packages/db/scripts/dev-db.mjs) 기준 id·토큰.
 * 화면이 늘면 여기에 한 줄씩 더한다.
 */

/** 데모 사용자 id. dev 로그인(`dev_user_id` 쿠키) 대상 */
export const DEV_USERS = {
  owner: '김사장',
  staff: '이알바',
  newbie: '박신입',
} as const;
export type DevUserId = keyof typeof DEV_USERS;

const DEMO_STORE_ID = 'store';
const DEMO_QR_TOKEN = 'demo-store-qr-token-'.padEnd(43, '0');
const DEMO_JOIN_TOKEN = 'demo-invite-join-'.padEnd(43, '0');
const DEMO_REREGISTER_TOKEN = 'demo-invite-reregister-'.padEnd(43, '0');

export interface DevScreen {
  title: string;
  path: string;
  /** 이 사용자로 dev 로그인한 뒤 연다. null 이면 로그인 없이(로그아웃 상태로) 연다 */
  as: DevUserId | null;
}

export interface DevScreenGroup {
  title: string;
  screens: DevScreen[];
}

const owner = (title: string, sub = ''): DevScreen => ({
  title,
  path: `/owner/${DEMO_STORE_ID}${sub}`,
  as: 'owner',
});

export const DEV_SCREEN_GROUPS: DevScreenGroup[] = [
  {
    title: '사장님 · 매장 (스택)',
    screens: [
      owner('대시보드'),
      owner('직원', '/members'),
      owner('직원 상세 · 이알바', '/members/m-staff'),
      owner('직원 상세 · 박신입 (근로조건 없음)', '/members/m-newbie'),
      owner('근로조건 등록 · 박신입', '/members/m-newbie/terms'),
      owner('근태 기록', '/attendances'),
      owner('근태 상세 · 퇴근 누락', '/attendances/att-3'),
      owner('정정 요청', '/corrections'),
      owner('정산', '/payroll'),
      owner('매장 설정', '/settings'),
    ],
  },
  {
    title: '사장님 · 매장 밖',
    screens: [
      { title: '내 매장', path: '/owner', as: 'owner' },
      { title: '매장 만들기', path: '/owner/stores/new', as: 'owner' },
      { title: '휴대폰 인증 (로그아웃 상태)', path: '/owner/login', as: null },
    ],
  },
  {
    title: '직원',
    screens: [
      { title: '내 근무 · 이알바', path: '/me', as: 'staff' },
      { title: '내 근무 상세 · 이알바', path: '/me/attendances/att-1', as: 'staff' },
      { title: '내 근무 · 박신입 (근로조건 없음)', path: '/me', as: 'newbie' },
      { title: 'QR 출퇴근 · 이알바', path: `/p/${DEMO_QR_TOKEN}`, as: 'staff' },
      { title: '새 직원 초대 (로그아웃 상태)', path: `/invite/${DEMO_JOIN_TOKEN}`, as: null },
      { title: '이알바 기기 재등록 (로그아웃 상태)', path: `/invite/${DEMO_REREGISTER_TOKEN}`, as: null },
    ],
  },
];

/** dev 로그인 후 path 로 보내는 주소 */
export function devLoginHref(screen: Pick<DevScreen, 'path' | 'as'>): string {
  const params = new URLSearchParams({ next: screen.path });
  if (screen.as) params.set('as', screen.as);
  return `/api/dev/login?${params.toString()}`;
}
