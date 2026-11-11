'use client';

import { useCallback, useEffect, useState } from 'react';

import { apiFetch } from '@/shared/lib/api-client';
import { errorMessageOf, useApiResource } from '@/shared/lib/useApiResource';

import type { StoreSettingsDto } from '../model/store-settings-types';

/** 매장 설정 조회 + 저장. 저장 응답이 최신 설정이라 바로 화면에 반영한다 */
export function useStoreSettings(storeId: string) {
  const resource = useApiResource<StoreSettingsDto>(`/api/v1/stores/${storeId}/settings`);
  const [settings, setSettings] = useState<StoreSettingsDto | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  useEffect(() => {
    if (resource.data) setSettings(resource.data);
  }, [resource.data]);

  const save = useCallback(
    async (path: string, method: 'PATCH' | 'POST', body: unknown, successText: string) => {
      setPending(true);
      setMessage(null);
      try {
        setSettings(await apiFetch<StoreSettingsDto>(path, { method, body: JSON.stringify(body) }));
        setMessage({ text: successText, error: false });
      } catch (error) {
        setMessage({ text: errorMessageOf(error), error: true });
      } finally {
        setPending(false);
      }
    },
    [],
  );

  return {
    settings,
    errorMessage: resource.errorMessage,
    pending,
    message,
    saveName: (name: string) => save(`/api/v1/stores/${storeId}`, 'PATCH', { name }, '매장 이름을 바꿨어요'),
    saveStartDay: (payPeriodStartDay: number) =>
      save(`/api/v1/stores/${storeId}`, 'PATCH', { payPeriodStartDay }, '정산 시작일을 저장했어요'),
    savePayDay: (payDay: number | null) =>
      save(`/api/v1/stores/${storeId}`, 'PATCH', { payDay }, '급여 지급일을 저장했어요'),
    declareHeadcount: (band: string, effectiveFrom: string) =>
      save(`/api/v1/stores/${storeId}/headcount-declarations`, 'POST', { band, effectiveFrom }, '사업장 규모를 저장했어요'),
  };
}
