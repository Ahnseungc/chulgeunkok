'use client';

import { ActionButton, Text } from '@seed-design/react';
import { useEffect, useState } from 'react';

import { formatWon as won } from '@/features/payroll/model/payroll-types';
import InlineAlert from '@/shared/ui/InlineAlert';
import LabeledTextField from '@/shared/ui/LabeledTextField';
import Sheet from '@/shared/ui/Sheet';

import { CUSTOM_CODE, type PayslipLineDto } from '../model/payslip-types';

import { LINE_KIND_LABEL } from './payslip-labels';
import type { NewLineValues } from './usePayslipDetail';

/** 서버 스키마(features/payslip/schema.ts)와 같은 길이 */
const LABEL_MAX_LENGTH = 30;
const BASIS_MAX_LENGTH = 200;
const REASON_MAX_LENGTH = 200;
const KINDS = ['EARNING', 'DEDUCTION'] as const;

export type LineEditTarget = { mode: 'edit'; line: PayslipLineDto } | { mode: 'add' };

interface LineEditSheetProps {
  /** null이면 닫힘 */
  target: LineEditTarget | null;
  pending: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onSave: (line: PayslipLineDto, amount: number, adjustReason: string | undefined) => void;
  onAdd: (values: NewLineValues) => void;
  onDelete: (line: PayslipLineDto) => void;
}

const digitsOnly = (value: string) => value.replace(/\D/g, '');

/** 줄 금액 수정·항목 추가 시트 — docs/specs/payslip §4.2·§5.2 */
export default function LineEditSheet(props: LineEditSheetProps) {
  // 닫히는 동안에도 마지막 내용을 그린다 (Sheet 닫힘 애니메이션)
  const [shown, setShown] = useState<LineEditTarget | null>(props.target);
  useEffect(() => {
    if (props.target) setShown(props.target);
  }, [props.target]);
  const title = shown?.mode === 'edit' ? shown.line.label : '항목 추가';

  return (
    <Sheet open={props.target !== null} onClose={props.onClose} title={title}>
      {shown?.mode === 'edit' ? <EditLineForm key={shown.line.id} line={shown.line} {...props} /> : null}
      {shown?.mode === 'add' ? <AddLineForm {...props} /> : null}
      <InlineAlert message={props.errorMessage} textStyle="t4Regular" />
    </Sheet>
  );
}

function EditLineForm({ line, pending, onClose, onSave, onDelete }: LineEditSheetProps & { line: PayslipLineDto }) {
  const [amount, setAmount] = useState(String(line.amount));
  const [reason, setReason] = useState(line.adjustReason ?? '');
  const differsFromCalculated = line.calculatedAmount !== null && Number(amount) !== line.calculatedAmount;
  const canSave = amount !== '' && (!differsFromCalculated || reason.trim().length > 0);

  return (
    <>
      <LabeledTextField label="금액 (원)" value={amount} onValueChange={(value) => setAmount(digitsOnly(value))} inputMode="numeric" />
      {line.calculatedAmount !== null ? (
        <Text as="p" textStyle="t4Regular" color="fg.neutralMuted">
          계산값 {won(line.calculatedAmount)} · {line.basis}
        </Text>
      ) : null}
      {differsFromCalculated ? (
        <LabeledTextField
          label="바꾼 이유 (직원에게 보여요)"
          value={reason}
          onValueChange={setReason}
          maxLength={REASON_MAX_LENGTH}
          placeholder="예: 식대 포함으로 합의"
        />
      ) : null}
      <div className="sheet__actions">
        {line.code === CUSTOM_CODE ? (
          <ActionButton variant="neutralWeak" size="large" flexGrow disabled={pending} onClick={() => onDelete(line)}>
            항목 지우기
          </ActionButton>
        ) : (
          <ActionButton variant="neutralWeak" size="large" flexGrow onClick={onClose}>
            취소
          </ActionButton>
        )}
        <ActionButton
          variant="neutralSolid"
          size="large"
          flexGrow
          loading={pending}
          disabled={!canSave}
          onClick={() => onSave(line, Number(amount), differsFromCalculated ? reason.trim() : undefined)}
        >
          저장
        </ActionButton>
      </div>
    </>
  );
}

function AddLineForm({ pending, onClose, onAdd }: LineEditSheetProps) {
  const [kind, setKind] = useState<NewLineValues['kind']>('EARNING');
  const [label, setLabel] = useState('');
  const [basis, setBasis] = useState('');
  const [amount, setAmount] = useState('');
  const canSave = label.trim().length > 0 && amount !== '';

  return (
    <>
      <div className="headcount__options" role="group" aria-label="항목 종류">
        {KINDS.map((option) => (
          <ActionButton
            key={option}
            size="small"
            variant={kind === option ? 'neutralSolid' : 'neutralWeak'}
            aria-pressed={kind === option}
            onClick={() => setKind(option)}
          >
            {LINE_KIND_LABEL[option]}
          </ActionButton>
        ))}
      </div>
      <LabeledTextField label="이름" value={label} onValueChange={setLabel} maxLength={LABEL_MAX_LENGTH} placeholder="예: 식대" />
      <LabeledTextField label="금액 (원)" value={amount} onValueChange={(value) => setAmount(digitsOnly(value))} inputMode="numeric" />
      <LabeledTextField
        label="계산방법 (없으면 비워 두세요)"
        value={basis}
        onValueChange={setBasis}
        maxLength={BASIS_MAX_LENGTH}
        placeholder="예: 20일 × 5,000원"
      />
      <div className="sheet__actions">
        <ActionButton variant="neutralWeak" size="large" flexGrow onClick={onClose}>
          취소
        </ActionButton>
        <ActionButton
          variant="neutralSolid"
          size="large"
          flexGrow
          loading={pending}
          disabled={!canSave}
          onClick={() => onAdd({ kind, label: label.trim(), basis: basis.trim(), amount: Number(amount) })}
        >
          추가
        </ActionButton>
      </div>
    </>
  );
}
