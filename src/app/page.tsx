import { redirect } from 'next/navigation';

/** 진입점. ponytail: 세션 연결 전까지 로그인으로 보낸다. 이후 소속 매장 유무로 /owner 또는 /me 분기 */
export default function HomePage() {
  redirect('/login');
}
