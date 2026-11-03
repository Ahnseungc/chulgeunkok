'use client';

import { Text, TextField } from '@seed-design/react';
import { useId, type InputHTMLAttributes } from 'react';

interface LabeledTextFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'onChange' | 'value' | 'size'> {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
}

/** 라벨과 연결된 Seed TextField. 스크린리더가 placeholder 대신 라벨을 읽는다 */
export default function LabeledTextField({
  label,
  value,
  onValueChange,
  ...inputProps
}: LabeledTextFieldProps) {
  const inputId = useId();
  return (
    <div className="labeled-field">
      <label htmlFor={inputId}>
        <Text as="span" textStyle="t4Medium">
          {label}
        </Text>
      </label>
      <TextField.Root>
        <TextField.Input
          id={inputId}
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          {...inputProps}
        />
      </TextField.Root>
    </div>
  );
}
