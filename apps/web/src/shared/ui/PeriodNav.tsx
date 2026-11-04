'use client';

import { ActionButton, Text } from '@seed-design/react';

import type { PeriodWithNav } from '@/features/payroll/model/work-time';
import { formatPeriodRange } from '@/shared/lib/format-time';

interface PeriodNavProps {
  period: PeriodWithNav;
  onChange: (periodStart: string) => void;
}

/** 정산 기간 이동. 아직 시작하지 않은 다음 기간으로는 가지 않는다 */
export default function PeriodNav({ period, onChange }: PeriodNavProps) {
  return (
    <div className="period-nav" role="group" aria-label="정산 기간">
      <ActionButton variant="ghost" size="small" aria-label="이전 기간" onClick={() => onChange(period.prevStart)}>
        ‹
      </ActionButton>
      <Text textStyle="t5Bold">{formatPeriodRange(period.start, period.end)}</Text>
      <ActionButton
        variant="ghost"
        size="small"
        aria-label="다음 기간"
        disabled={!period.nextStart}
        onClick={() => period.nextStart && onChange(period.nextStart)}
      >
        ›
      </ActionButton>
    </div>
  );
}
