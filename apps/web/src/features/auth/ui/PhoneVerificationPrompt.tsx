'use client';

import { ActionButton, Text } from '@seed-design/react';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';

import { phoneVerificationPath } from '../model/after-login';

const DEFAULT_MESSAGE = '급여를 보려면 휴대폰 인증이 필요해요.';

interface PhoneVerificationPromptProps {
  message?: string | null;
}

/**
 * 급여 권한 Manager가 휴대폰 인증 전일 때 (docs/specs/auth §4.2). 인증을 마치면 지금 화면으로 돌아온다.
 * 스택 밖 `/owner/login` 으로 나가므로 지금 주소는 누를 때 읽는다.
 */
export default function PhoneVerificationPrompt({ message }: PhoneVerificationPromptProps) {
  const router = useRouter();
  const handleVerify = () => router.push(phoneVerificationPath(window.location.pathname) as Route);

  return (
    <div className="verify-prompt" role="alert">
      <Text as="p" textStyle="t5Regular">
        {message ?? DEFAULT_MESSAGE}
      </Text>
      <ActionButton variant="neutralSolid" size="medium" onClick={handleVerify}>
        휴대폰 인증하기
      </ActionButton>
    </div>
  );
}
