/** 브라우저가 현재 프레임을 레이아웃·페인트한 뒤 callback 실행. cleanup 반환 */
export function runAfterPaint(callback: () => void): () => void {
  let outerId = 0;
  let innerId = 0;
  let cancelled = false;

  outerId = requestAnimationFrame(() => {
    if (cancelled) return;
    innerId = requestAnimationFrame(() => {
      if (cancelled) return;
      callback();
    });
  });

  return () => {
    cancelled = true;
    cancelAnimationFrame(outerId);
    cancelAnimationFrame(innerId);
  };
}

const DEFAULT_MAX_ATTEMPTS = 12;

interface RunAfterPaintWhenOptions {
  maxAttempts?: number;
  onGiveUp?: () => void;
}

/** paint 이후 준비 조건이 충족될 때까지 재시도한 뒤 callback 실행 */
export function runAfterPaintWhen(isReady: () => boolean, callback: () => void, options?: RunAfterPaintWhenOptions): () => void {
  const maxAttempts = options?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  let cancelled = false;
  let cleanupAfterPaint: (() => void) | undefined;
  let attempts = 0;

  const schedule = () => {
    if (cancelled) return;
    cleanupAfterPaint = runAfterPaint(() => {
      if (cancelled) return;
      if (isReady()) {
        callback();
        return;
      }
      if (attempts >= maxAttempts) {
        options?.onGiveUp?.();
        return;
      }
      attempts += 1;
      schedule();
    });
  };

  schedule();

  return () => {
    cancelled = true;
    cleanupAfterPaint?.();
  };
}
