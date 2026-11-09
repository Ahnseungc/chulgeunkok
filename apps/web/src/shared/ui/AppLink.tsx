'use client';

import { useStackRouter } from '@ahnseungchan/webviewkit';
import type { Route } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createContext, type MouseEvent, type ReactNode, useContext } from 'react';

/**
 * 스택 라우터(@ahnseungchan/webviewkit) 안에서 열린 화면인지.
 * ponytail: 라이브러리가 "Provider 안인지" 확인할 방법을 주지 않아 직접 둔다 (useStackRouter 는 밖에서 throw)
 */
export const InStackContext = createContext(false);

interface AppLinkProps<T extends string = string> {
  href: Route<T>;
  className?: string;
  children: ReactNode;
}

const isPlainClick = (event: MouseEvent) =>
  event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;

const StackLink = <T extends string>({ href, className, children }: AppLinkProps<T>) => {
  const { push } = useStackRouter();
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!isPlainClick(event)) return;
    event.preventDefault();
    push(href);
  };
  return (
    <a href={href} className={className} onClick={handleClick}>
      {children}
    </a>
  );
};

/** 스택 안이면 스택 push, 밖이면 next/link */
export function AppLink<T extends string>(props: AppLinkProps<T>) {
  const inStack = useContext(InStackContext);
  if (inStack) return <StackLink {...props} />;
  return <Link {...props} />;
}

const StackBackLink = <T extends string>({ href, className, children }: AppLinkProps<T>) => {
  const { back, canGoBack, replace } = useStackRouter();
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!isPlainClick(event)) return;
    event.preventDefault();
    // 딥링크로 바로 들어와 스택이 비어 있으면 상위 화면으로 바꿔 끼운다
    if (canGoBack) back();
    else replace(href);
  };
  return (
    <a href={href} className={className} onClick={handleClick}>
      {children}
    </a>
  );
};

/**
 * 저장 뒤 상위 화면으로 돌아가기. 스택 안이면 back(없으면 replace), 밖이면 next router push.
 * ponytail: 라이브러리에 throw 하지 않는 useStackRouter 가 없어 inStack 으로 갈라 부른다 (화면 수명 동안 값이 바뀌지 않음)
 */
export function useBackTo(): <T extends string>(href: Route<T>) => void {
  const inStack = useContext(InStackContext);
  const router = useRouter();
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const stack = inStack ? useStackRouter() : null;
  return (href) => {
    if (!stack) router.push(href);
    else if (stack.canGoBack) stack.back();
    else stack.replace(href);
  };
}

/** 화면 상단 "← 상위" 링크. 스택 안이면 back, 밖이면 href 로 이동 */
export function AppBackLink<T extends string>(props: AppLinkProps<T>) {
  const inStack = useContext(InStackContext);
  if (inStack) return <StackBackLink {...props} />;
  return <Link {...props} />;
}
