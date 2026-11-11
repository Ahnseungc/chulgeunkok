'use client';

import { useCallback, useState } from 'react';

import { apiFetch, ApiRequestError } from '@/shared/lib/api-client';
import { toStoreLocalDate } from '@/shared/lib/format-time';
import { errorMessageOf } from '@/shared/lib/useApiResource';

import type { CreateTermsResultDto, DeductionTypeValue, TermsDto, TermsScheduleDto } from '../model/labor-types';

const DEFAULT_SCHEDULE: Omit<TermsScheduleDto, 'weekday'> = { startTime: '09:00', endTime: '18:00', breakMinutes: 60 };

export interface TermsFormValues {
  effectiveFrom: string;
  hourlyWage: string;
  schedules: TermsScheduleDto[];
  scheduleVaries: boolean;
  averageWeeklyHours: string;
  weeklyHolidayWeekday: number | null;
  contractStartDate: string;
  contractEndDate: string;
  deductionType: DeductionTypeValue;
}

/** 기존 근로조건이 있으면 그 값으로, 없으면 오늘부터 시작하는 빈 폼 */
export function initialTermsValues(current: TermsDto | null, now = new Date()): TermsFormValues {
  const today = toStoreLocalDate(now);
  return {
    effectiveFrom: today,
    hourlyWage: current ? String(current.hourlyWage) : '',
    schedules: current?.schedules ?? [],
    scheduleVaries: current?.scheduleVaries ?? false,
    averageWeeklyHours: current?.averageWeeklyMinutesOverride ? String(current.averageWeeklyMinutesOverride / 60) : '',
    weeklyHolidayWeekday: current?.weeklyHolidayWeekday ?? 0,
    contractStartDate: current?.contractStartDate ?? today,
    contractEndDate: current?.contractEndDate ?? '',
    deductionType: current?.deductionType ?? 'NONE',
  };
}

/** 요일을 켜면 마지막으로 입력한 시간을 복사한다 (같은 시간 근무가 대부분) */
export function toggleWeekday(schedules: TermsScheduleDto[], weekday: number): TermsScheduleDto[] {
  if (schedules.some((schedule) => schedule.weekday === weekday)) {
    return schedules.filter((schedule) => schedule.weekday !== weekday);
  }
  const template = schedules.at(-1) ?? { weekday, ...DEFAULT_SCHEDULE };
  return [...schedules, { ...template, weekday }].sort((a, b) => a.weekday - b.weekday);
}

function toRequestBody(values: TermsFormValues, confirmBelowMinimumWage: boolean) {
  return {
    effectiveFrom: values.effectiveFrom,
    hourlyWage: Number(values.hourlyWage),
    schedules: values.scheduleVaries ? [] : values.schedules,
    scheduleVaries: values.scheduleVaries,
    averageWeeklyMinutesOverride: values.scheduleVaries ? Math.round(Number(values.averageWeeklyHours) * 60) : null,
    weeklyHolidayWeekday: values.weeklyHolidayWeekday,
    contractStartDate: values.contractStartDate,
    contractEndDate: values.contractEndDate || null,
    deductionType: values.deductionType,
    confirmBelowMinimumWage,
  };
}

/** 근로조건 저장. 최저임금 미달이면 확인을 받고 다시 보낸다 (docs/specs/labor §3.2) */
export function useSaveTerms(termsPath: string) {
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [minimumWageToConfirm, setMinimumWageToConfirm] = useState<number | null>(null);

  const save = useCallback(
    async (values: TermsFormValues, confirmBelowMinimumWage = false): Promise<CreateTermsResultDto | null> => {
      setPending(true);
      setErrorMessage(null);
      try {
        const result = await apiFetch<CreateTermsResultDto>(termsPath, {
          method: 'POST',
          body: JSON.stringify(toRequestBody(values, confirmBelowMinimumWage)),
        });
        setMinimumWageToConfirm(null);
        return result;
      } catch (error) {
        if (error instanceof ApiRequestError && error.code === 'MINIMUM_WAGE_CONFIRM_REQUIRED') {
          setMinimumWageToConfirm(Number(error.details?.minimumHourlyWage) || null);
          return null;
        }
        setErrorMessage(errorMessageOf(error));
        return null;
      } finally {
        setPending(false);
      }
    },
    [termsPath],
  );

  return { save, pending, errorMessage, minimumWageToConfirm, dismissMinimumWage: () => setMinimumWageToConfirm(null) };
}
