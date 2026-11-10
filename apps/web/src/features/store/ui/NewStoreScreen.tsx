'use client';

import { ActionButton, Text } from '@seed-design/react';
import { AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { useState } from 'react';

import { ExpandFadeReveal } from '@/shared/motion/ExpandFadeReveal';
import { PageStaggerEntrance, PageStaggerEntranceItem } from '@/shared/motion/PageStaggerEntrance';
import InlineAlert, { FLOW_REVEAL_CLASS, FLOW_REVEAL_GAP_PX } from '@/shared/ui/InlineAlert';
import LabeledTextField from '@/shared/ui/LabeledTextField';

import type { PlaceDto } from '../model/place-types';

import StoreQrCard from './StoreQrCard';
import { useBusinessVerification, useCreateStore, usePlaceSearch, type HeadcountBand } from './useNewStore';

const STORE_NAME_MAX_LENGTH = 30;

const HEADCOUNT_OPTIONS = [
  { band: 'UNDER_5', label: '5인 미만' },
  { band: 'FIVE_OR_MORE', label: '5인 이상' },
  { band: 'UNKNOWN', label: '잘 모르겠어요' },
] as const satisfies readonly { band: HeadcountBand; label: string }[];

const BUSINESS_STATUS_LABEL = {
  ACTIVE: '영업 중인 사업자예요',
  SUSPENDED: '휴업 중인 사업자예요',
  CLOSED: '폐업한 사업자예요',
  NOT_FOUND: '국세청에 등록되지 않은 번호예요',
} as const;

/** `/owner/stores/new` — docs/specs/store §3.6 */
export default function NewStoreScreen() {
  const search = usePlaceSearch();
  const business = useBusinessVerification();
  const store = useCreateStore();
  const [place, setPlace] = useState<PlaceDto | null>(null);
  const [name, setName] = useState('');
  const [businessNumber, setBusinessNumber] = useState('');
  const [headcountBand, setHeadcountBand] = useState<HeadcountBand | null>(null);

  if (store.created) {
    return (
      <main className="screen">
        <StoreQrCard storeName={store.created.store.name} url={store.created.qr.url} />
        <div className="punch-bottom">
          <ActionButton asChild variant="neutralSolid" size="large" flexGrow>
            <Link href="/owner">확인</Link>
          </ActionButton>
        </div>
      </main>
    );
  }

  const choosePlace = (selected: PlaceDto) => {
    setPlace(selected);
    setName(selected.name.slice(0, STORE_NAME_MAX_LENGTH));
  };
  const canSubmit = name.trim().length > 0 && headcountBand !== null && !store.pending;

  return (
    <main className="screen">
      {/* 처음 열 때 한 번 위→아래로 이어서 내려온다. 검색 결과·확인 결과는 아래 칸을 툭 밀지 않고 펼친다 */}
      <PageStaggerEntrance className="motion-contents">
        <PageStaggerEntranceItem>
          <Text as="h1" textStyle="t8Bold">
            어떤 가게인가요?
          </Text>
        </PageStaggerEntranceItem>

        <PageStaggerEntranceItem>
          <LabeledTextField
            label="가게 검색"
            value={search.query}
            onValueChange={search.changeQuery}
            placeholder="가게 이름으로 검색 (예: 골목카페)"
          />
        </PageStaggerEntranceItem>
        <InlineAlert message={search.errorMessage} textStyle="t4Regular" />
        <AnimatePresence initial={false}>
          {!place && search.places.length > 0 ? (
            <ExpandFadeReveal key="places" className={FLOW_REVEAL_CLASS} revealTopPadding={FLOW_REVEAL_GAP_PX}>
              <ul className="place-list" aria-label="검색 결과">
                {search.places.map((result) => (
                  <li key={result.placeId}>
                    <button type="button" className="place-list__item" onClick={() => choosePlace(result)}>
                      <Text textStyle="t5Bold">{result.name}</Text>
                      <Text textStyle="t4Regular" color="fg.neutralMuted">
                        {[result.category, result.roadAddress ?? result.address].filter(Boolean).join(' · ')}
                      </Text>
                    </button>
                  </li>
                ))}
              </ul>
            </ExpandFadeReveal>
          ) : null}
          {place ? (
            <ExpandFadeReveal key="selected" className={FLOW_REVEAL_CLASS} revealTopPadding={FLOW_REVEAL_GAP_PX}>
              <div className="selected-place">
                <Text textStyle="t4Regular" color="fg.neutralMuted">
                  {place.roadAddress ?? place.address}
                </Text>
                <ActionButton type="button" variant="ghost" size="small" onClick={() => setPlace(null)}>
                  다른 가게 선택
                </ActionButton>
              </div>
            </ExpandFadeReveal>
          ) : null}
        </AnimatePresence>

        <PageStaggerEntranceItem>
          <LabeledTextField
            label="매장 이름 (직원에게 보여요)"
            value={name}
            onValueChange={setName}
            maxLength={STORE_NAME_MAX_LENGTH}
            placeholder="검색하지 않고 직접 입력해도 돼요"
          />
        </PageStaggerEntranceItem>

        <PageStaggerEntranceItem>
          <div className="business-number">
            <LabeledTextField
              label="사업자등록번호 (선택)"
              value={businessNumber}
              onValueChange={(value) => {
                setBusinessNumber(value);
                business.reset();
              }}
              inputMode="numeric"
              placeholder="000-00-00000"
            />
            <ActionButton
              type="button"
              variant="neutralWeak"
              size="medium"
              loading={business.pending}
              disabled={businessNumber.replace(/\D/g, '').length !== 10}
              onClick={() => business.verify(businessNumber)}
            >
              확인
            </ActionButton>
          </div>
        </PageStaggerEntranceItem>
        <InlineAlert
          message={business.result ? BUSINESS_STATUS_LABEL[business.result.status] : null}
          textStyle="t4Regular"
          color={business.result?.status === 'ACTIVE' ? 'fg.positive' : 'fg.critical'}
          role="status"
        />
        <InlineAlert message={business.errorMessage} textStyle="t4Regular" />

        <PageStaggerEntranceItem>
          <fieldset className="headcount">
            <legend>
              <Text as="span" textStyle="t4Medium">
                함께 일하는 사람 수 (사장님 포함, 지난 1개월 평균)
              </Text>
            </legend>
            <div className="headcount__options">
              {HEADCOUNT_OPTIONS.map((option) => (
                <ActionButton
                  key={option.band}
                  type="button"
                  size="medium"
                  variant={headcountBand === option.band ? 'neutralSolid' : 'neutralWeak'}
                  aria-pressed={headcountBand === option.band}
                  onClick={() => setHeadcountBand(option.band)}
                >
                  {option.label}
                </ActionButton>
              ))}
            </div>
          </fieldset>
        </PageStaggerEntranceItem>

        <InlineAlert message={store.errorMessage} textStyle="t4Regular" />
      </PageStaggerEntrance>
      <div className="punch-bottom">
        <ActionButton
          variant="neutralSolid"
          size="large"
          flexGrow
          loading={store.pending}
          disabled={!canSubmit}
          onClick={() =>
            headcountBand &&
            store.create({ place, name: name.trim(), businessNumber, headcountBand })
          }
        >
          매장 만들기
        </ActionButton>
      </div>
    </main>
  );
}
