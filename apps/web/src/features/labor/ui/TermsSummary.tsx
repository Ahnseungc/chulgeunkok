import { Text } from '@seed-design/react';

import { formatDuration } from '@/shared/lib/format-time';

import { DEDUCTION_TYPE_LABEL, type TermsDto } from '../model/labor-types';
import { WEEKDAY_LABELS } from '../model/review-copy';

const MINUTE_MS = 60_000;

const formatDate = (iso: string) =>
  new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric' }).format(new Date(iso));

/** 근로조건 요약 카드. docs/specs/labor §7 */
export default function TermsSummary({ terms }: { terms: TermsDto }) {
  return (
    <dl className="terms-summary">
      <dt>시급</dt>
      <dd>{terms.hourlyWage.toLocaleString('ko-KR')}원</dd>
      <dt>근무</dt>
      <dd>
        {terms.scheduleVaries
          ? '주마다 달라요'
          : terms.schedules
              .map((schedule) => `${WEEKDAY_LABELS[schedule.weekday]} ${schedule.startTime}–${schedule.endTime}`)
              .join(', ') || '없음'}
      </dd>
      <dt>주 소정근로</dt>
      <dd>{formatDuration(terms.weeklyContractMinutes * MINUTE_MS)}</dd>
      <dt>주휴일</dt>
      <dd>{terms.weeklyHolidayWeekday === null ? '정하지 않음' : `${WEEKDAY_LABELS[terms.weeklyHolidayWeekday]}요일`}</dd>
      <dt>급여 공제</dt>
      <dd>{DEDUCTION_TYPE_LABEL[terms.deductionType]}</dd>
      <dt>적용</dt>
      <dd>
        {formatDate(terms.effectiveFrom)}부터
        {terms.effectiveTo ? ` ${formatDate(terms.effectiveTo)} 전까지` : ''} · {terms.version}번째 버전
      </dd>
      {terms.schedules.some((schedule) => schedule.breakMinutes > 0) ? (
        <>
          <dt>휴게</dt>
          <dd>
            <Text textStyle="t4Regular">
              {terms.schedules
                .map((schedule) => `${WEEKDAY_LABELS[schedule.weekday]} ${schedule.breakMinutes}분`)
                .join(', ')}
            </Text>
          </dd>
        </>
      ) : null}
    </dl>
  );
}
