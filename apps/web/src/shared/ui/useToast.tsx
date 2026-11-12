'use client';

import { Snackbar, useSnackbarAdapter } from '@seed-design/react';

/** 토스트가 떠 있는 시간. 한 줄 문구를 읽을 만큼 */
export const TOAST_TIMEOUT_MS = 3000;

type ToastVariant = 'default' | 'positive' | 'critical';

/** `ToastProvider` 아래에서 토스트를 띄운다. 새 토스트는 떠 있던 것을 바로 바꾼다 */
export function useToast() {
  const snackbar = useSnackbarAdapter();
  const show = (variant: ToastVariant) => (message: string) =>
    snackbar.create({
      timeout: TOAST_TIMEOUT_MS,
      render: () => (
        <Snackbar.Root variant={variant}>
          <Snackbar.Content>
            <Snackbar.Message>{message}</Snackbar.Message>
          </Snackbar.Content>
        </Snackbar.Root>
      ),
    });
  return { success: show('positive'), error: show('critical'), info: show('default') };
}
