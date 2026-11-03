'use client';

import { ActionButton, Text } from '@seed-design/react';
import Image from 'next/image';
import { useState } from 'react';

import LabeledTextField from '@/shared/ui/LabeledTextField';

import { useOwnerLogin, type OwnerLoginStep } from './useOwnerLogin';

const CODE_LENGTH = 6;
const NAME_MAX_LENGTH = 20;

const TITLE = {
  phone: '사장님 휴대폰 번호를 알려 주세요',
  code: '문자로 받은 인증번호를 입력해 주세요',
  name: '이름을 알려 주세요',
} as const satisfies Record<OwnerLoginStep['step'], string>;

/** `/owner/login` — docs/specs/auth §4 */
export default function OwnerLoginScreen() {
  const login = useOwnerLogin();
  const { state } = login;

  return (
    <main className="screen">
      <Image src="/brand/wordmark.png" alt="출근콕" width={104} height={40} priority />
      <Text as="h1" textStyle="t8Bold">
        {TITLE[state.step]}
      </Text>
      {state.step === 'phone' ? <PhoneStep {...login} /> : null}
      {state.step === 'code' ? <CodeStep {...login} phone={state.phone} devCode={state.devCode} /> : null}
      {state.step === 'name' ? <NameStep {...login} /> : null}
    </main>
  );
}

interface StepProps {
  pending: boolean;
  errorMessage: string | null;
}

function PhoneStep({ pending, errorMessage, sendCode }: StepProps & { sendCode: (phone: string) => void }) {
  const [phone, setPhone] = useState('');
  return (
    <StepForm
      pending={pending}
      errorMessage={errorMessage}
      submitLabel="인증번호 받기"
      canSubmit={phone.replace(/\D/g, '').length >= 10}
      onSubmit={() => sendCode(phone)}
    >
      <LabeledTextField
        label="휴대폰 번호"
        value={phone}
        onValueChange={setPhone}
        inputMode="tel"
        autoComplete="tel"
        placeholder="010-0000-0000"
      />
    </StepForm>
  );
}

interface CodeStepProps extends StepProps {
  phone: string;
  devCode: string | null;
  verifyCode: (phone: string, code: string) => void;
  restart: () => void;
}

function CodeStep({ phone, devCode, pending, errorMessage, verifyCode, restart }: CodeStepProps) {
  const [code, setCode] = useState('');
  return (
    <StepForm
      pending={pending}
      errorMessage={errorMessage}
      submitLabel="확인"
      canSubmit={code.length === CODE_LENGTH}
      onSubmit={() => verifyCode(phone, code)}
    >
      <LabeledTextField
        label="인증번호 6자리"
        value={code}
        onValueChange={(value) => setCode(value.replace(/\D/g, '').slice(0, CODE_LENGTH))}
        inputMode="numeric"
        autoComplete="one-time-code"
      />
      {devCode ? (
        <Text as="p" textStyle="t4Regular" color="fg.neutralMuted">
          개발용 인증번호: {devCode}
        </Text>
      ) : null}
      <ActionButton type="button" variant="ghost" size="small" onClick={restart}>
        번호 다시 입력
      </ActionButton>
    </StepForm>
  );
}

function NameStep({ pending, errorMessage, saveName }: StepProps & { saveName: (name: string) => void }) {
  const [name, setName] = useState('');
  return (
    <StepForm
      pending={pending}
      errorMessage={errorMessage}
      submitLabel="시작하기"
      canSubmit={name.trim().length > 0}
      onSubmit={() => saveName(name.trim())}
    >
      <LabeledTextField
        label="이름"
        value={name}
        onValueChange={setName}
        maxLength={NAME_MAX_LENGTH}
        autoComplete="name"
        placeholder="직원에게 보이는 이름"
      />
    </StepForm>
  );
}

interface StepFormProps extends StepProps {
  submitLabel: string;
  canSubmit: boolean;
  onSubmit: () => void;
  children: React.ReactNode;
}

function StepForm({ pending, errorMessage, submitLabel, canSubmit, onSubmit, children }: StepFormProps) {
  return (
    <form
      className="step-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSubmit && !pending) onSubmit();
      }}
    >
      <div className="step-form__fields">
        {children}
        {errorMessage ? (
          <Text as="p" textStyle="t4Regular" color="fg.critical" role="alert">
            {errorMessage}
          </Text>
        ) : null}
      </div>
      <div className="punch-bottom">
        <ActionButton
          type="submit"
          variant="neutralSolid"
          size="large"
          flexGrow
          loading={pending}
          disabled={!canSubmit}
        >
          {submitLabel}
        </ActionButton>
      </div>
    </form>
  );
}
