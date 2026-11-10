'use client';

import { usePathname } from 'next/navigation';

/** 개발 전용: 모든 화면에서 /dev(화면 바로가기)로 가는 버튼. 루트 레이아웃이 production 이 아닐 때만 그린다 */
export default function DevMenuButton() {
  const pathname = usePathname();
  if (pathname === '/dev') return null;
  return (
    <a className="dev-menu-button" href="/dev" aria-label="개발용 화면 바로가기">
      DEV
    </a>
  );
}
