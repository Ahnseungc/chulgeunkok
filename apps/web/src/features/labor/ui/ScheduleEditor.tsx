'use client';

import { ActionButton, Text } from '@seed-design/react';

import LabeledTextField from '@/shared/ui/LabeledTextField';

import type { TermsScheduleDto } from '../model/labor-types';
import { WEEKDAY_LABELS } from '../model/review-copy';

import { toggleWeekday, type TermsFormValues } from './useTermsForm';

/** 휴게 선택지 (분). 법정 최소는 4시간 30분, 8시간 60분 */
const BREAK_OPTIONS = [0, 30, 60, 90, 120] as const;
/** 월요일부터 보여 준다 */
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

interface ScheduleEditorProps {
  values: TermsFormValues;
  onChange: (patch: Partial<TermsFormValues>) => void;
}

/** 요일별 소정 근무. docs/specs/labor §3.1 */
export default function ScheduleEditor({ values, onChange }: ScheduleEditorProps) {
  const updateSchedule = (weekday: number, patch: Partial<TermsScheduleDto>) =>
    onChange({
      schedules: values.schedules.map((schedule) => (schedule.weekday === weekday ? { ...schedule, ...patch } : schedule)),
    });

  return (
    <fieldset className="schedule-editor">
      <legend>
        <Text as="span" textStyle="t4Medium">
          일하는 요일과 시간
        </Text>
      </legend>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={values.scheduleVaries}
          onChange={(event) => onChange({ scheduleVaries: event.target.checked })}
        />
        <Text as="span" textStyle="t4Regular">
          주마다 달라요 (근무표로 일해요)
        </Text>
      </label>

      {values.scheduleVaries ? (
        <LabeledTextField
          label="최근 4주 평균, 주 몇 시간 일하나요?"
          value={values.averageWeeklyHours}
          onValueChange={(averageWeeklyHours) => onChange({ averageWeeklyHours: averageWeeklyHours.replace(/[^\d.]/g, '') })}
          inputMode="decimal"
          placeholder="예: 20"
        />
      ) : (
        <>
          <div className="weekday-toggles" role="group" aria-label="일하는 요일">
            {WEEKDAY_ORDER.map((weekday) => {
              const selected = values.schedules.some((schedule) => schedule.weekday === weekday);
              return (
                <ActionButton
                  key={weekday}
                  type="button"
                  size="small"
                  variant={selected ? 'neutralSolid' : 'neutralWeak'}
                  aria-pressed={selected}
                  onClick={() => onChange({ schedules: toggleWeekday(values.schedules, weekday) })}
                >
                  {WEEKDAY_LABELS[weekday]}
                </ActionButton>
              );
            })}
          </div>
          {values.schedules.map((schedule) => (
            <div key={schedule.weekday} className="schedule-row">
              <Text as="span" textStyle="t4Bold" className="schedule-row__day">
                {WEEKDAY_LABELS[schedule.weekday]}
              </Text>
              <input
                type="time"
                className="native-input"
                aria-label={`${WEEKDAY_LABELS[schedule.weekday]}요일 출근 시각`}
                value={schedule.startTime}
                onChange={(event) => updateSchedule(schedule.weekday, { startTime: event.target.value })}
              />
              <span aria-hidden="true">–</span>
              <input
                type="time"
                className="native-input"
                aria-label={`${WEEKDAY_LABELS[schedule.weekday]}요일 퇴근 시각`}
                value={schedule.endTime}
                onChange={(event) => updateSchedule(schedule.weekday, { endTime: event.target.value })}
              />
              <select
                className="native-select"
                aria-label={`${WEEKDAY_LABELS[schedule.weekday]}요일 휴게시간`}
                value={schedule.breakMinutes}
                onChange={(event) => updateSchedule(schedule.weekday, { breakMinutes: Number(event.target.value) })}
              >
                {BREAK_OPTIONS.map((minutes) => (
                  <option key={minutes} value={minutes}>
                    휴게 {minutes}분
                  </option>
                ))}
              </select>
            </div>
          ))}
          {values.schedules.some((schedule) => schedule.endTime < schedule.startTime) ? (
            <Text as="p" textStyle="t3Regular" color="fg.neutralMuted">
              퇴근이 출근보다 이르면 다음 날 퇴근으로 계산해요
            </Text>
          ) : null}
        </>
      )}
    </fieldset>
  );
}
