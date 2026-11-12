'use client';

import { ActionButton, Text } from '@seed-design/react';
import Image from 'next/image';
import { useState } from 'react';

import { TextEntrance } from '@/shared/motion/TextEntrance';
import InlineAlert from '@/shared/ui/InlineAlert';
import LabeledTextField from '@/shared/ui/LabeledTextField';

import { DEFAULT_AFTER_LOGIN_PATH } from '../model/after-login';

import { useOwnerLogin, type OwnerLoginStep } from './useOwnerLogin';

const CODE_LENGTH = 6;
const NAME_MAX_LENGTH = 20;
/** 제목 다음에 입력칸이 이어서 올라오게 */
const FIELDS_ENTRANCE_DELAY_S = 0.05;

const TITLE = {
  phone: '사장님 휴대폰 번호를 알려 주세요',
  code: '문자로 받은 인증번호를 입력해 주세요',
  name: '이름을 알려 주세요',
} as const satisfies Record<OwnerLoginStep['step'], string>;

/** 급여 권한 Manager가 번호를 인증할 때 첫 제목 (§4.2) */
const ATTACH_PHONE_TITLE = '급여를 보려면 휴대폰 번호를 인증해 주세요';

interface OwnerLoginScreenProps {
  attach?: boolean;
  nextPath?: string;
}

/** `/owner/login` — docs/specs/auth §4. `attach`면 지금 기기에 번호만 붙이고 `nextPath`로 돌아간다 (§4.2) */
export default function OwnerLoginScreen({ attach = false, nextPath = DEFAULT_AFTER_LOGIN_PATH }: OwnerLoginScreenProps) {
  const login = useOwnerLogin({ attach, nextPath });
  const { state } = login;
  const title = attach && state.step === 'phone' ? ATTACH_PHONE_TITLE : TITLE[state.step];

  return (
    <main className="screen">
      <Image src="/brand/wordmark.png" alt="출근콕" width={104} height={40} priority />
      {/* 단계가 바뀔 때마다 제목·입력칸이 살짝 올라오며 바뀐다 (입력은 바로 된다) */}
      <TextEntrance key={state.step}>
        <Text as="h1" textStyle="t8Bold">
          {title}
        </Text>
      </TextEntrance>
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
      <TextEntrance className="step-form__fields" delay={FIELDS_ENTRANCE_DELAY_S}>
        {children}
        <InlineAlert message={errorMessage} textStyle="t4Regular" />
      </TextEntrance>
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
