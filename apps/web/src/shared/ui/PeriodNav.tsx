'use client';

import { ActionButton, Text } from '@seed-design/react';

import type { PeriodWithNav } from '@/features/payroll/model/work-time';
import { formatPeriodRange } from '@/shared/lib/format-time';

import { TEXT_PLACEHOLDER } from './text-placeholder';

interface PeriodNavProps {
  /** 아직 조회 전이면 null — 같은 높이로 자리만 잡고 이동 버튼은 막는다 */
  period: PeriodWithNav | null;
  onChange: (periodStart: string) => void;
}

/** 정산 기간 이동. 아직 시작하지 않은 다음 기간으로는 가지 않는다 */
export default function PeriodNav({ period, onChange }: PeriodNavProps) {
  return (
    <div className="period-nav" role="group" aria-label="정산 기간">
      <ActionButton
        variant="ghost"
        size="small"
        aria-label="이전 기간"
        disabled={!period}
        onClick={() => period && onChange(period.prevStart)}
      >
        ‹
      </ActionButton>
      <Text textStyle="t5Bold">{period ? formatPeriodRange(period.start, period.end) : TEXT_PLACEHOLDER}</Text>
      <ActionButton
        variant="ghost"
        size="small"
        aria-label="다음 기간"
        disabled={!period?.nextStart}
        onClick={() => period?.nextStart && onChange(period.nextStart)}
      >
        ›
      </ActionButton>
    </div>
  );
}
