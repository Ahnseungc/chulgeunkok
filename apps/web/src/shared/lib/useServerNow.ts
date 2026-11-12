'use client';

import { useEffect, useState } from 'react';

const CLOCK_TICK_MS = 60_000;

/** 경과 시간은 서버 시각 기준으로 1분마다 갱신한다 (기기 시계가 틀려도 같다) */
export function useServerNow(serverNow: string | null): Date {
  const [now, setNow] = useState(() => (serverNow ? new Date(serverNow) : new Date()));
  useEffect(() => {
    if (!serverNow) return;
    const offsetMs = new Date(serverNow).getTime() - Date.now();
    setNow(new Date(serverNow));
    const timer = setInterval(() => setNow(new Date(Date.now() + offsetMs)), CLOCK_TICK_MS);
    return () => clearInterval(timer);
  }, [serverNow]);
  return now;
}
