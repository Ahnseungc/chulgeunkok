'use client';

import { useOptionalStackRouter } from '@ahnseungchan/webviewkit';
import type { Route } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { MouseEvent, ReactNode } from 'react';

interface AppLinkProps<T extends string = string> {
  href: Route<T>;
  className?: string;
  children: ReactNode;
}

const isPlainClick = (event: MouseEvent) =>
  event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;

/** 스택(@ahnseungchan/webviewkit) 안이면 스택 push, 밖이면 next/link */
export function AppLink<T extends string>({ href, className, children }: AppLinkProps<T>) {
  const stack = useOptionalStackRouter();
  if (!stack) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  }
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!isPlainClick(event)) return;
    event.preventDefault();
    stack.push(href);
  };
  return (
    <a href={href} className={className} onClick={handleClick}>
      {children}
    </a>
  );
}

/** 저장 뒤 상위 화면으로 돌아가기. 스택 안이면 back(없으면 replace), 밖이면 next router push */
export function useBackTo(): <T extends string>(href: Route<T>) => void {
  const stack = useOptionalStackRouter();
  const router = useRouter();
  return (href) => {
    if (!stack) router.push(href);
    else if (stack.canGoBack) stack.back();
    else stack.replace(href);
  };
}

/** 화면 상단 "← 상위" 링크. 스택 안이면 back(딥링크로 들어와 스택이 비면 상위로 교체), 밖이면 href 로 이동 */
export function AppBackLink<T extends string>({ href, className, children }: AppLinkProps<T>) {
  const stack = useOptionalStackRouter();
  const backTo = useBackTo();
  if (!stack) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  }
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!isPlainClick(event)) return;
    event.preventDefault();
    backTo(href);
  };
  return (
    <a href={href} className={className} onClick={handleClick}>
      {children}
    </a>
  );
}
