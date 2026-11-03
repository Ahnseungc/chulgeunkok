'use client';

import { ActionButton, Text, TextField } from '@seed-design/react';
import Image from 'next/image';
import { useId, useState } from 'react';

import KokMark from '@/shared/ui/KokMark';

import type { InvitationInfoDto } from '../model/invitation-types';

import { useInvite, type InviteState } from './useInvite';

const NAME_MAX_LENGTH = 20;

interface InviteScreenProps {
  token: string;
}

/** 초대 수락 `/invite/[token]` — docs/specs/staff §3.3 */
export default function InviteScreen({ token }: InviteScreenProps) {
  const { state, accept } = useInvite(token);

  return (
    <main className="screen punch-screen">
      <Image src="/brand/wordmark.png" alt="출근콕" width={104} height={40} priority />
      <InviteBody state={state} onAccept={accept} />
    </main>
  );
}

interface InviteBodyProps {
  state: InviteState;
  onAccept: (info: InvitationInfoDto, name: string) => void;
}

function InviteBody({ state, onAccept }: InviteBodyProps) {
  if (state.phase === 'loading') return <Center title="초대를 확인하고 있어요" />;
  if (state.phase === 'invalid') return <Center title="초대를 열 수 없어요" description={state.message} />;
  if (state.phase === 'done') {
    return (
      <section className="punch-center" aria-live="polite">
        <KokMark />
        <Text as="h1" textStyle="t10Bold">
          등록됐어요
        </Text>
        <Text as="p" textStyle="t5Regular" color="fg.neutralMuted">
          이제 {state.result.storeName} QR을 찍으면 바로 출근할 수 있어요.
        </Text>
      </section>
    );
  }
  return (
    <InviteForm
      info={state.info}
      pending={state.phase === 'submitting'}
      errorMessage={state.phase === 'ready' ? state.errorMessage : null}
      onAccept={onAccept}
    />
  );
}

interface InviteFormProps {
  info: InvitationInfoDto;
  pending: boolean;
  errorMessage: string | null;
  onAccept: (info: InvitationInfoDto, name: string) => void;
}

function InviteForm({ info, pending, errorMessage, onAccept }: InviteFormProps) {
  const [name, setName] = useState('');
  const nameInputId = useId();
  const title =
    info.kind === 'REREGISTER'
      ? `${info.memberName}님의 새 휴대폰으로 등록해요`
      : `${info.storeName}에서 초대했어요`;
  const canSubmit = !info.needsName || name.trim().length > 0;

  return (
    <form
      className="invite-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSubmit) onAccept(info, name.trim());
      }}
    >
      <section className="punch-center">
        <Text as="h1" textStyle="t8Bold">
          {title}
        </Text>
        <Text as="p" textStyle="t5Regular" color="fg.neutralMuted">
          {info.inviterName}님이 보낸 링크예요
        </Text>
        {info.kind === 'REREGISTER' ? (
          <Text as="p" textStyle="t5Regular" color="fg.neutralMuted">
            등록하면 이전 휴대폰으로는 출근할 수 없어요
          </Text>
        ) : null}
        {info.needsName ? (
          <div className="invite-name">
            <label htmlFor={nameInputId}>
              <Text as="span" textStyle="t4Medium">
                이름
              </Text>
            </label>
            <TextField.Root>
              <TextField.Input
                id={nameInputId}
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={NAME_MAX_LENGTH}
                placeholder="사장님이 알아볼 수 있는 이름"
                autoComplete="name"
              />
            </TextField.Root>
          </div>
        ) : null}
        {errorMessage ? (
          <Text as="p" textStyle="t4Regular" color="fg.critical" role="alert">
            {errorMessage}
          </Text>
        ) : null}
      </section>
      <div className="punch-bottom">
        <ActionButton
          type="submit"
          variant="neutralSolid"
          size="large"
          flexGrow
          loading={pending}
          disabled={!canSubmit}
        >
          등록하기
        </ActionButton>
      </div>
    </form>
  );
}

function Center({ title, description }: { title: string; description?: string }) {
  return (
    <section className="punch-center" aria-live="polite">
      <Text as="h1" textStyle="t7Bold">
        {title}
      </Text>
      {description ? (
        <Text as="p" textStyle="t5Regular" color="fg.neutralMuted" align="center">
          {description}
        </Text>
      ) : null}
    </section>
  );
}
