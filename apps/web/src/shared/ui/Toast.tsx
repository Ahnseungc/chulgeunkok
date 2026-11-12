'use client';

import { Snackbar } from '@seed-design/react';
import type { ReactNode } from 'react';

interface ToastProviderProps {
  children: ReactNode;
}

/**
 * 앱 전체 토스트(Seed Snackbar) 자리. 루트 레이아웃에 한 번 둔다. 띄우기는 `useToast()`.
 * 영역은 position: fixed + 최대 z-index 라 일반 화면 위에 뜨지만, 열린 네이티브 <dialog>(Sheet)는 top layer 라
 * 그 뒤에 가려진다. 시트가 열린 동안의 오류는 시트 안 InlineAlert 로 보여 준다.
 */
export default function ToastProvider({ children }: ToastProviderProps) {
  return (
    <Snackbar.RootProvider>
      {children}
      <Snackbar.Region>
        <Snackbar.Renderer />
      </Snackbar.Region>
    </Snackbar.RootProvider>
  );
}
