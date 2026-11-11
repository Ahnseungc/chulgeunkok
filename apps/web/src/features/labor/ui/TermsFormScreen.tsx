'use client';

import { ActionButton, Text } from '@seed-design/react';
import { useEffect, useState } from 'react';

import type { MemberDetailDto } from '@/features/staff/model/member-types';
import { useApiResource } from '@/shared/lib/useApiResource';
import { PageStaggerEntrance, PageStaggerEntranceItem } from '@/shared/motion/PageStaggerEntrance';
import InlineAlert from '@/shared/ui/InlineAlert';
import LabeledTextField from '@/shared/ui/LabeledTextField';
import Sheet from '@/shared/ui/Sheet';
import { TEXT_PLACEHOLDER } from '@/shared/ui/text-placeholder';

import { DEDUCTION_TYPE_LABEL, type DeductionTypeValue, type LaborReviewDto } from '../model/labor-types';
import { WEEKDAY_LABELS } from '../model/review-copy';

import ReviewSheet from './ReviewSheet';
import ScheduleEditor from './ScheduleEditor';
import { initialTermsValues, useSaveTerms, type TermsFormValues } from './useTermsForm';
import { useBackTo } from '@/shared/ui/AppLink';
import ScreenHeader from '@/shared/ui/ScreenHeader';

const DEDUCTION_TYPES = ['NONE', 'WITHHOLDING_3_3', 'SOCIAL_INSURANCE'] as const satisfies readonly DeductionTypeValue[];

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

  const memberName = member.data?.name;
  const update = (patch: Partial<TermsFormValues>) => setValues((prev) => (prev ? { ...prev, ...patch } : prev));
  const submit = async (confirmBelowMinimumWage = false) => {
    if (!values) return;
    const result = await saver.save(values, confirmBelowMinimumWage);
    if (!result) return;
    const sheetReviews = result.reviews.filter((review) => review.presentation !== 'LIST');
    if (sheetReviews.length > 0) setSavedReviews(sheetReviews);
    else backTo(detailPath);
  };
  const wage = Number(values?.hourlyWage ?? 0);
  const belowMinimum = rule.data && wage > 0 && wage < rule.data.minimumHourlyWage;
  const canSubmit =
    values !== null && wage > 0 && (values.scheduleVaries ? Number(values.averageWeeklyHours) > 0 : values.schedules.length > 0);
  // 직원 이름이 오기 전에도 같은 줄 수로 제목을 그려 아래 폼이 밀리지 않는다
  const title = memberName ? `${memberName}님 근로조건` : '근로조건';

  return (
    <main className="screen">
      <ScreenHeader backHref={detailPath} backLabel={memberName ?? '직원 정보'} title={title} />
      <Text as="h1" textStyle="t8Bold">
        {title}
      </Text>
      <InlineAlert message={member.errorMessage} />

      {values ? (
        <PageStaggerEntrance className="motion-contents">
          <PageStaggerEntranceItem className="screen-stack">
            <LabeledTextField
              label="시급 (원)"
              value={values.hourlyWage}
              onValueChange={(hourlyWage) => update({ hourlyWage: hourlyWage.replace(/\D/g, '') })}
              inputMode="numeric"
              placeholder={rule.data ? `${rule.data.minimumHourlyWage.toLocaleString('ko-KR')} 이상` : ''}
            />
            {/* 최저임금은 폼보다 늦게 와서 줄을 먼저 잡아 둔다 */}
            <Text as="p" textStyle="t4Regular" color={belowMinimum ? 'fg.critical' : 'fg.neutralMuted'}>
              {rule.data ? `올해 최저임금은 ${rule.data.minimumHourlyWage.toLocaleString('ko-KR')}원이에요` : TEXT_PLACEHOLDER}
            </Text>
          </PageStaggerEntranceItem>

          <PageStaggerEntranceItem className="screen-stack">
            <ScheduleEditor values={values} onChange={update} />
          </PageStaggerEntranceItem>

          <PageStaggerEntranceItem className="screen-stack">
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

            {/* 임금명세서 공제 줄을 정한다 (docs/specs/payslip §3.3) */}
            <div className="labeled-field">
              <Text as="span" textStyle="t4Medium">
                급여 공제
              </Text>
              <div className="headcount__options" role="group" aria-label="급여 공제">
                {DEDUCTION_TYPES.map((type) => (
                  <ActionButton
                    key={type}
                    size="small"
                    variant={values.deductionType === type ? 'neutralSolid' : 'neutralWeak'}
                    aria-pressed={values.deductionType === type}
                    onClick={() => update({ deductionType: type })}
                  >
                    {DEDUCTION_TYPE_LABEL[type]}
                  </ActionButton>
                ))}
              </div>
            </div>

            <LabeledTextField label="계약 시작일" type="date" value={values.contractStartDate} onValueChange={(contractStartDate) => update({ contractStartDate })} />
            <LabeledTextField label="계약 종료일 (없으면 비워 두세요)" type="date" value={values.contractEndDate} onValueChange={(contractEndDate) => update({ contractEndDate })} />
            <LabeledTextField label="이 근로조건 적용 시작일" type="date" value={values.effectiveFrom} onValueChange={(effectiveFrom) => update({ effectiveFrom })} />
          </PageStaggerEntranceItem>
        </PageStaggerEntrance>
      ) : null}

      <InlineAlert message={saver.errorMessage} textStyle="t4Regular" />
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
