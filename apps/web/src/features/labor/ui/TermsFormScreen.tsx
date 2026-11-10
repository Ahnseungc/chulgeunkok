'use client';

import { ActionButton, Text } from '@seed-design/react';
import { useEffect, useState } from 'react';

import type { MemberDetailDto } from '@/features/staff/model/member-types';
import { useApiResource } from '@/shared/lib/useApiResource';
import LabeledTextField from '@/shared/ui/LabeledTextField';
import Sheet from '@/shared/ui/Sheet';

import type { LaborReviewDto } from '../model/labor-types';
import { WEEKDAY_LABELS } from '../model/review-copy';

import ReviewSheet from './ReviewSheet';
import ScheduleEditor from './ScheduleEditor';
import { initialTermsValues, useSaveTerms, type TermsFormValues } from './useTermsForm';
import { useBackTo } from '@/shared/ui/AppLink';
import ScreenHeader from '@/shared/ui/ScreenHeader';

interface TermsFormScreenProps {
  storeId: string;
  memberId: string;
}

/** 근로조건 등록·수정 — docs/specs/labor §3·§7 */
export default function TermsFormScreen({ storeId, memberId }: TermsFormScreenProps) {
  const backTo = useBackTo();
  const memberPath = `/api/v1/stores/${storeId}/members/${memberId}`;
  const detailPath = `/owner/${storeId}/members/${memberId}` as const;
  const member = useApiResource<MemberDetailDto>(memberPath);
  const [values, setValues] = useState<TermsFormValues | null>(null);
  const rule = useApiResource<{ minimumHourlyWage: number }>(
    values ? `/api/v1/labor-rules/current?date=${values.effectiveFrom}` : null,
  );
  const saver = useSaveTerms(`${memberPath}/employment-terms`);
  const [savedReviews, setSavedReviews] = useState<LaborReviewDto[] | null>(null);

  useEffect(() => {
    if (member.data && !values) setValues(initialTermsValues(member.data.currentTerms));
  }, [member.data, values]);

  if (!values || !member.data) {
    return <main className="screen">{member.errorMessage ? <Text color="fg.critical">{member.errorMessage}</Text> : null}</main>;
  }

  const update = (patch: Partial<TermsFormValues>) => setValues({ ...values, ...patch });
  const submit = async (confirmBelowMinimumWage = false) => {
    const result = await saver.save(values, confirmBelowMinimumWage);
    if (!result) return;
    const sheetReviews = result.reviews.filter((review) => review.presentation !== 'LIST');
    if (sheetReviews.length > 0) setSavedReviews(sheetReviews);
    else backTo(detailPath);
  };
  const wage = Number(values.hourlyWage);
  const belowMinimum = rule.data && wage > 0 && wage < rule.data.minimumHourlyWage;
  const canSubmit =
    wage > 0 && (values.scheduleVaries ? Number(values.averageWeeklyHours) > 0 : values.schedules.length > 0);

  return (
    <main className="screen">
      <ScreenHeader backHref={detailPath} backLabel={member.data.name} title={`${member.data.name}님 근로조건`} />
      <Text as="h1" textStyle="t8Bold">
        {member.data.name}님 근로조건
      </Text>

      <LabeledTextField
        label="시급 (원)"
        value={values.hourlyWage}
        onValueChange={(hourlyWage) => update({ hourlyWage: hourlyWage.replace(/\D/g, '') })}
        inputMode="numeric"
        placeholder={rule.data ? `${rule.data.minimumHourlyWage.toLocaleString('ko-KR')} 이상` : ''}
      />
      {rule.data ? (
        <Text as="p" textStyle="t4Regular" color={belowMinimum ? 'fg.critical' : 'fg.neutralMuted'}>
          올해 최저임금은 {rule.data.minimumHourlyWage.toLocaleString('ko-KR')}원이에요
        </Text>
      ) : null}

      <ScheduleEditor values={values} onChange={update} />

      <label className="labeled-field">
        <Text as="span" textStyle="t4Medium">
          주휴일
        </Text>
        <select
          className="native-select"
          value={values.weeklyHolidayWeekday ?? ''}
          onChange={(event) => update({ weeklyHolidayWeekday: event.target.value === '' ? null : Number(event.target.value) })}
        >
          <option value="">아직 정하지 않았어요</option>
          {WEEKDAY_LABELS.map((label, weekday) => (
            <option key={label} value={weekday}>
              {label}요일
            </option>
          ))}
        </select>
      </label>

      <LabeledTextField label="계약 시작일" type="date" value={values.contractStartDate} onValueChange={(contractStartDate) => update({ contractStartDate })} />
      <LabeledTextField label="계약 종료일 (없으면 비워 두세요)" type="date" value={values.contractEndDate} onValueChange={(contractEndDate) => update({ contractEndDate })} />
      <LabeledTextField label="이 근로조건 적용 시작일" type="date" value={values.effectiveFrom} onValueChange={(effectiveFrom) => update({ effectiveFrom })} />

      {saver.errorMessage ? (
        <Text as="p" textStyle="t4Regular" color="fg.critical" role="alert">
          {saver.errorMessage}
        </Text>
      ) : null}
      <div className="punch-bottom">
        <ActionButton variant="neutralSolid" size="large" flexGrow loading={saver.pending} disabled={!canSubmit} onClick={() => void submit()}>
          저장
        </ActionButton>
      </div>

      <Sheet open={saver.minimumWageToConfirm !== null} onClose={saver.dismissMinimumWage} title="최저임금보다 낮은 시급이에요">
        <Text as="p" textStyle="t5Regular" color="fg.neutralMuted">
          올해 최저임금은 {saver.minimumWageToConfirm?.toLocaleString('ko-KR')}원이에요. 그래도 저장할까요?
        </Text>
        <div className="sheet__actions">
          <ActionButton variant="neutralWeak" size="large" flexGrow onClick={saver.dismissMinimumWage}>
            시급 고치기
          </ActionButton>
          <ActionButton variant="criticalSolid" size="large" flexGrow loading={saver.pending} onClick={() => void submit(true)}>
            그래도 저장
          </ActionButton>
        </div>
      </Sheet>

      <ReviewSheet
        reviews={savedReviews ?? []}
        open={savedReviews !== null}
        onClose={() => backTo(detailPath)}
        onEditTerms={() => setSavedReviews(null)}
      />
    </main>
  );
}
