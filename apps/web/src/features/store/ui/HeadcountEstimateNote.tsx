import { Text } from '@seed-design/react';

import type { StoreSettingsDto } from '../model/store-settings-types';

interface HeadcountEstimateNoteProps {
  estimate: NonNullable<StoreSettingsDto['headcountEstimate']>;
}

/** 직전 달 출근 기록 참고 추정치 (docs/specs/store §6.4) */
export default function HeadcountEstimateNote({ estimate }: HeadcountEstimateNoteProps) {
  return (
    <div role="note">
      <Text textStyle="t4Regular">출근 기록으로 보면 지난달 하루 평균 {estimate.average}명이 일했어요.</Text>
      {estimate.mismatch ? (
        <Text textStyle="t4Regular" color="fg.critical">
          신고한 규모와 달라요. 규모를 다시 확인해 주세요.
        </Text>
      ) : null}
      <Text textStyle="t3Regular" color="fg.neutralMuted">
        참고값이며 법적 판단이 아니에요.
      </Text>
    </div>
  );
}
