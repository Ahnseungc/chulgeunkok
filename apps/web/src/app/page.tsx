import { redirect } from 'next/navigation';

/**
 * 웹 진입점은 사장님 화면. 직원은 QR(/p/…)·초대(/invite/…)로만 들어온다.
 * ponytail: RN 앱이 생기면 앱 셸이 역할에 따라 첫 화면을 정한다 (docs/specs/auth §6)
 */
export default function HomePage() {
  redirect('/owner');
}
