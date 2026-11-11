'use client';

import { ActionButton, Text } from '@seed-design/react';
import { useEffect, useState } from 'react';

import { formatLocalDate, formatPeriodRange, toStoreLocalDate } from '@/shared/lib/format-time';
import { PageStaggerEntrance, PageStaggerEntranceItem } from '@/shared/motion/PageStaggerEntrance';
import InlineAlert from '@/shared/ui/InlineAlert';
import LabeledTextField from '@/shared/ui/LabeledTextField';

import { HEADCOUNT_LABEL, type HeadcountBandValue, type StoreSettingsDto } from '../model/store-settings-types';

import QrRotateSection from './QrRotateSection';
import { useStoreSettings } from './useStoreSettings';
import ScreenHeader from '@/shared/ui/ScreenHeader';

const STORE_NAME_MAX_LENGTH = 30;
/** 정산 시작일은 1~28 (월말 문제 회피, docs/specs/payroll §3.1) */
const START_DAYS = Array.from({ length: 28 }, (_, index) => index + 1);
/** 급여 지급일 1~31, 없는 날은 말일 (docs/specs/payslip §3.4) */
const PAY_DAYS = Array.from({ length: 31 }, (_, index) => index + 1);
const BANDS = ['UNDER_5', 'FIVE_OR_MORE', 'UNKNOWN'] as const satisfies readonly HeadcountBandValue[];

/** `/owner/[storeId]/settings` — docs/specs/store §7 */
export default function SettingsScreen({ storeId }: { storeId: string }) {
  const store = useStoreSettings(storeId);
  const settings = store.settings;

  return (
    <main className="screen">
      <ScreenHeader backHref={`/owner/${storeId}`} backLabel="매장 홈" title="매장 설정" />
      <Text as="h1" textStyle="t8Bold">
        매장 설정
      </Text>
      <InlineAlert message={store.errorMessage} />
      {/* 저장 결과는 화면 위에 생겨도 아래 칸을 툭 밀지 않고 펼친다 */}
      <InlineAlert
        message={store.message?.text}
        textStyle="t4Regular"
        color={store.message?.error ? 'fg.critical' : 'fg.positive'}
        role="status"
      />
      {settings ? (
        <PageStaggerEntrance className="motion-contents">
          <PageStaggerEntranceItem>
            <NameSection settings={settings} pending={store.pending} onSave={store.saveName} />
          </PageStaggerEntranceItem>
          <PageStaggerEntranceItem>
            <StartDaySection settings={settings} pending={store.pending} onSave={store.saveStartDay} />
          </PageStaggerEntranceItem>
          <PageStaggerEntranceItem>
            <PayDaySection settings={settings} pending={store.pending} onSave={store.savePayDay} />
          </PageStaggerEntranceItem>
          <PageStaggerEntranceItem>
            <HeadcountSection settings={settings} pending={store.pending} onSave={store.declareHeadcount} />
          </PageStaggerEntranceItem>
          <PageStaggerEntranceItem>
            <QrRotateSection storeId={storeId} storeName={settings.name} qrIssuedAt={settings.qrIssuedAt} />
          </PageStaggerEntranceItem>
        </PageStaggerEntrance>
      ) : null}
    </main>
  );
}

interface SectionProps<T extends unknown[]> {
  settings: StoreSettingsDto;
  pending: boolean;
  onSave: (...args: T) => Promise<void>;
}

function NameSection({ settings, pending, onSave }: SectionProps<[string]>) {
  const [name, setName] = useState(settings.name);
  useEffect(() => setName(settings.name), [settings.name]);
  return (
    <section className="detail-section" aria-label="매장 정보">
      <LabeledTextField label="매장 이름 (직원에게 보여요)" value={name} onValueChange={setName} maxLength={STORE_NAME_MAX_LENGTH} />
      {settings.address ? (
        <Text textStyle="t4Regular" color="fg.neutralMuted">
          {settings.address}
        </Text>
      ) : null}
      <ActionButton
        variant="neutralWeak"
        size="medium"
        disabled={pending || !name.trim() || name.trim() === settings.name}
        onClick={() => void onSave(name.trim())}
      >
        이름 저장
      </ActionButton>
    </section>
  );
}

function StartDaySection({ settings, pending, onSave }: SectionProps<[number]>) {
  const { payPeriod } = settings;
  const selected = payPeriod.pendingChange?.startDay ?? payPeriod.currentStartDay;
  return (
    <section className="detail-section" aria-labelledby="start-day-heading">
      <Text as="h2" id="start-day-heading" textStyle="t6Bold">
        정산 시작일
      </Text>
      <Text textStyle="t4Regular" color="fg.neutralMuted">
        지금 정산 기간: {formatPeriodRange(payPeriod.currentPeriod.start, payPeriod.currentPeriod.end)}
      </Text>
      <select
        className="native-select"
        aria-label="정산 시작일"
        value={selected}
        disabled={pending}
        onChange={(event) => void onSave(Number(event.target.value))}
      >
        {START_DAYS.map((day) => (
          <option key={day} value={day}>
            매월 {day}일
          </option>
        ))}
      </select>
      {payPeriod.pendingChange ? (
        <Text textStyle="t4Regular" color="fg.warning">
          {formatLocalDate(payPeriod.pendingChange.effectiveFrom)}부터 매월 {payPeriod.pendingChange.startDay}일 기준으로 바뀌어요. 지금
          기간은 그대로예요.
        </Text>
      ) : null}
    </section>
  );
}

function PayDaySection({ settings, pending, onSave }: SectionProps<[number | null]>) {
  return (
    <section className="detail-section" aria-labelledby="pay-day-heading">
      <Text as="h2" id="pay-day-heading" textStyle="t6Bold">
        급여 지급일
      </Text>
      <Text textStyle="t4Regular" color="fg.neutralMuted">
        임금명세서에 들어가요. 정산 기간이 끝난 뒤 처음 오는 이 날짜가 지급일이에요. 그 달에 없는 날이면 말일이에요.
      </Text>
      <select
        className="native-select"
        aria-label="급여 지급일"
        value={settings.payDay ?? ''}
        disabled={pending}
        onChange={(event) => void onSave(event.target.value === '' ? null : Number(event.target.value))}
      >
        <option value="">정하지 않음 (명세서마다 넣기)</option>
        {PAY_DAYS.map((day) => (
          <option key={day} value={day}>
            매월 {day}일
          </option>
        ))}
      </select>
    </section>
  );
}

function HeadcountSection({ settings, pending, onSave }: SectionProps<[string, string]>) {
  const today = toStoreLocalDate(new Date());
  const [band, setBand] = useState<HeadcountBandValue>(settings.headcount.current);
  const [effectiveFrom, setEffectiveFrom] = useState(today);
  return (
    <section className="detail-section" aria-labelledby="headcount-heading">
      <Text as="h2" id="headcount-heading" textStyle="t6Bold">
        사업장 규모 · 지금 {HEADCOUNT_LABEL[settings.headcount.current]}
      </Text>
      <Text textStyle="t4Regular" color="fg.neutralMuted">
        지난 1개월 동안 일한 사람 수(아르바이트·사장님 가족 포함)를 일한 날 수로 나눈 값이에요. 등록한 직원 수와 달라요.
      </Text>
      <div className="headcount__options" role="group" aria-label="사업장 규모">
        {BANDS.map((option) => (
          <ActionButton
            key={option}
            size="small"
            variant={band === option ? 'neutralSolid' : 'neutralWeak'}
            aria-pressed={band === option}
            onClick={() => setBand(option)}
          >
            {HEADCOUNT_LABEL[option]}
          </ActionButton>
        ))}
      </div>
      <LabeledTextField label="언제부터인가요? (최근 90일 안)" type="date" value={effectiveFrom} onValueChange={setEffectiveFrom} max={today} />
      <ActionButton variant="neutralWeak" size="medium" disabled={pending} onClick={() => void onSave(band, effectiveFrom)}>
        규모 저장
      </ActionButton>
      {settings.headcount.history.length > 0 ? (
        <ul className="review-list">
          {settings.headcount.history.map((row) => (
            <li key={row.effectiveFrom} className="review-list__item">
              <Text textStyle="t4Regular" color="fg.neutralMuted">
                {formatLocalDate(row.effectiveFrom)}부터 {HEADCOUNT_LABEL[row.band]} · {row.declaredByName}
              </Text>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
