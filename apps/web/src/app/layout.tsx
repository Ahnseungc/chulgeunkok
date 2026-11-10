import '@seed-design/css/all.css';
// 한글 웹폰트. 기기에 한글 시스템 폰트가 없어도(일부 Android WebView·iOS 시뮬레이터) 같은 글꼴로 보인다.
// dynamic subset 이라 화면에 나온 글자 묶음만 받는다
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import './globals.css';

import type { Metadata, Viewport } from 'next';

import DevMenuButton from '@/shared/ui/DevMenuButton';

export const metadata: Metadata = {
  title: '출근콕',
  description: '스티커 하나로 시작하는, 작은 가게를 위한 직원 관리',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

/**
 * Seed 컬러 토큰은 <html data-seed> 속성으로 켠다.
 * ponytail: MVP는 라이트 모드만. 다크 모드는 data-seed-color-mode="system" + 사용자 스킴 스크립트로 확장
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" data-seed="" data-seed-color-mode="light-only">
      <head>
        <meta name="color-scheme" content="light" />
      </head>
      <body>
        {children}
        {process.env.NODE_ENV !== 'production' && <DevMenuButton />}
      </body>
    </html>
  );
}
