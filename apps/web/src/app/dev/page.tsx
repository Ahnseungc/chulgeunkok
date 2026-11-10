import { Text } from '@seed-design/react';
import { notFound } from 'next/navigation';

import { DEV_SCREEN_GROUPS } from '@/features/dev/model/dev-screens';
import DevScreenLink from '@/features/dev/ui/DevScreenLink';

/**
 * 개발 전용: 모든 화면 바로가기. 앱(WebView)에서는 화면 구석 DEV 버튼으로 들어온다.
 * 링크는 dev 로그인(/api/dev/login)으로 화면에 맞는 데모 사용자 쿠키를 심고 연다. production 에서는 404
 */
export default function DevScreensPage() {
  if (process.env.NODE_ENV === 'production') notFound();

  return (
    <main className="screen">
      <Text as="h1" textStyle="t8Bold">
        화면 바로가기
      </Text>
      <Text textStyle="t4Regular" color="fg.neutralMuted">
        `pnpm db:dev` 데모 데이터 기준이에요. 누르면 표시된 사용자로 바꿔 열어요.
      </Text>
      {DEV_SCREEN_GROUPS.map((group) => (
        <section key={group.title} className="dev-screens__group">
          <Text as="h2" textStyle="t5Bold">
            {group.title}
          </Text>
          <ul className="store-list">
            {group.screens.map((screen) => (
              <li key={`${screen.as}-${screen.path}`}>
                <DevScreenLink screen={screen} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
