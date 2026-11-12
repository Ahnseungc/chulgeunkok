'use client';

import { ActionButton, Text } from '@seed-design/react';
import { useRef, type ChangeEvent } from 'react';

import InlineAlert from '@/shared/ui/InlineAlert';
import LabeledTextField from '@/shared/ui/LabeledTextField';

import { QR_CARD_COLORS } from '../model/qr-card-colors';
import {
  QR_CARD_COLOR_KEYS,
  QR_CARD_LAYOUTS,
  QR_CARD_MESSAGE_MAX,
  QR_CARD_TITLE_MAX,
  type QrCardDesignDto,
  type QrCardLayoutKey,
} from '../model/qr-card-types';

import { QR_LOGO_ACCEPT } from './qr-card-files';
import type { QrCardDesignPatch } from './useQrCard';

const LAYOUT_LABEL: Record<QrCardLayoutKey, string> = { STAND: '스탠드', STICKER: '스티커' };

interface QrCardControlsProps {
  design: QrCardDesignDto;
  onChange: (patch: QrCardDesignPatch) => void;
  logo: { image: HTMLImageElement | null; pending: boolean; error: string | null };
  onUploadLogo: (file: File) => void;
  onRemoveLogo: () => void;
}

/** 레이아웃·색·매장 이름·안내 문구(스탠드만)·로고 (docs/specs/qr-card §5.3) */
export default function QrCardControls({ design, onChange, logo, onUploadLogo, onRemoveLogo }: QrCardControlsProps) {
  return (
    <>
      <div className="qr-card-options" role="group" aria-label="레이아웃">
        {QR_CARD_LAYOUTS.map((layout) => (
          <ActionButton
            key={layout}
            size="small"
            variant={design.layout === layout ? 'neutralSolid' : 'neutralWeak'}
            aria-pressed={design.layout === layout}
            onClick={() => onChange({ layout })}
          >
            {LAYOUT_LABEL[layout]}
          </ActionButton>
        ))}
      </div>
      <div className="qr-card-options" role="group" aria-label="색">
        {QR_CARD_COLOR_KEYS.map((color) => (
          <button
            key={color}
            type="button"
            className="qr-card-swatch"
            // 색 견본은 프리셋 값 그대로 보여 준다 (qr-card-colors.ts)
            style={{ background: QR_CARD_COLORS[color].background, color: QR_CARD_COLORS[color].accent }}
            aria-label={QR_CARD_COLORS[color].label}
            aria-pressed={design.color === color}
            onClick={() => onChange({ color })}
          >
            <span className="qr-card-swatch__dot" aria-hidden="true" />
          </button>
        ))}
      </div>
      <LabeledTextField
        label="매장 이름"
        value={design.title}
        onValueChange={(title) => onChange({ title })}
        maxLength={QR_CARD_TITLE_MAX}
      />
      {design.layout === 'STAND' ? (
        <LabeledTextField
          label="안내 문구"
          value={design.message}
          onValueChange={(message) => onChange({ message })}
          maxLength={QR_CARD_MESSAGE_MAX}
        />
      ) : null}
      <LogoField logo={logo} onUpload={onUploadLogo} onRemove={onRemoveLogo} />
    </>
  );
}

interface LogoFieldProps {
  logo: QrCardControlsProps['logo'];
  onUpload: (file: File) => void;
  onRemove: () => void;
}

function LogoField({ logo, onUpload, onRemove }: LogoFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // 같은 파일을 다시 골라도 change 가 오게 비운다
    event.target.value = '';
    if (file) onUpload(file);
  };

  return (
    <div className="labeled-field">
      <Text as="span" textStyle="t4Medium">
        로고 (PNG·JPG)
      </Text>
      <input ref={inputRef} type="file" accept={QR_LOGO_ACCEPT} hidden aria-label="로고 파일" onChange={handleFile} />
      <div className="qr-card-options">
        <ActionButton variant="neutralWeak" size="small" loading={logo.pending} onClick={() => inputRef.current?.click()}>
          {logo.image ? '로고 바꾸기' : '로고 올리기'}
        </ActionButton>
        {logo.image ? (
          <ActionButton variant="neutralWeak" size="small" disabled={logo.pending} onClick={onRemove}>
            로고 지우기
          </ActionButton>
        ) : null}
      </div>
      <InlineAlert message={logo.error} textStyle="t4Regular" />
    </div>
  );
}
