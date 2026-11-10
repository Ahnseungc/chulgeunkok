'use client';

import { Text } from '@seed-design/react';
import { type MouseEvent, useState } from 'react';

import { type DevScreen, DEV_USERS, devLoginUrl } from '../model/dev-screens';

interface DevScreenLinkProps {
  screen: DevScreen;
}

/** 데모 사용자로 dev 로그인(쿠키)한 뒤 화면으로 전체 이동한다. 로그인이 실패하면 이동하지 않고 이유를 보여 준다 */
export default function DevScreenLink({ screen }: DevScreenLinkProps) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleClick = async (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    try {
      const res = await fetch(devLoginUrl(screen.as), { method: 'POST' });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        setErrorMessage(body?.error?.message ?? `dev 로그인 실패 (${res.status})`);
        return;
      }
      window.location.assign(screen.path);
    } catch {
      setErrorMessage('dev 서버에 연결하지 못했어요');
    }
  };

  return (
    <a className="store-list__item" href={screen.path} onClick={(event) => void handleClick(event)}>
      <Text textStyle="t5Bold">{screen.title}</Text>
      <Text textStyle="t3Regular" color="fg.neutralMuted">
        {screen.as ? DEV_USERS[screen.as] : '로그아웃'} · {screen.path}
      </Text>
      {errorMessage ? (
        <Text textStyle="t3Regular" color="fg.critical" role="alert">
          {errorMessage}
        </Text>
      ) : null}
    </a>
  );
}
