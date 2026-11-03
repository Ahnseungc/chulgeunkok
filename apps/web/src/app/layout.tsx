import '@seed-design/css/all.css';
import './globals.css';

import type { Metadata, Viewport } from 'next';

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
      <body>{children}</body>
    </html>
  );
}
