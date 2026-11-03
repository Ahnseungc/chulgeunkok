'use client';

import { debounce } from 'es-toolkit';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { apiFetch, ApiRequestError } from '@/shared/lib/api-client';

import type { BusinessVerificationDto, CreateStoreResultDto, PlaceDto } from '../model/place-types';

const SEARCH_DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;

export type HeadcountBand = 'UNDER_5' | 'FIVE_OR_MORE' | 'UNKNOWN';

const messageOf = (error: unknown) =>
  error instanceof ApiRequestError ? error.message : '연결이 불안정해요. 잠시 후 다시 시도해 주세요.';

/** 가게 검색 (입력 300ms 뒤 서버 검색). docs/specs/store §3.1 */
export function usePlaceSearch() {
  const [query, setQuery] = useState('');
  const [places, setPlaces] = useState<PlaceDto[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const search = useMemo(
    () =>
      debounce(async (value: string) => {
        if (value.trim().length < MIN_QUERY_LENGTH) {
          setPlaces([]);
          return;
        }
        try {
          const result = await apiFetch<{ places: PlaceDto[] }>(
            `/api/v1/places/search?${new URLSearchParams({ query: value.trim() })}`,
          );
          setPlaces(result.places);
          setErrorMessage(null);
        } catch (error) {
          setErrorMessage(messageOf(error));
        }
      }, SEARCH_DEBOUNCE_MS),
    [],
  );

  useEffect(() => () => search.cancel(), [search]);

  const changeQuery = (value: string) => {
    setQuery(value);
    search(value);
  };

  return { query, changeQuery, places, errorMessage };
}

/** 사업자번호 확인 (선택). docs/specs/store §3.2 */
export function useBusinessVerification() {
  const [result, setResult] = useState<BusinessVerificationDto | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const verify = useCallback(async (businessNumber: string) => {
    setPending(true);
    setErrorMessage(null);
    try {
      setResult(
        await apiFetch<BusinessVerificationDto>('/api/v1/business-registrations/verify', {
          method: 'POST',
          body: JSON.stringify({ businessNumber }),
        }),
      );
    } catch (error) {
      setResult(null);
      setErrorMessage(messageOf(error));
    } finally {
      setPending(false);
    }
  }, []);

  return { result, errorMessage, pending, verify, reset: () => setResult(null) };
}

/** 매장 만들기. docs/specs/store §3.3 */
export function useCreateStore() {
  const [created, setCreated] = useState<CreateStoreResultDto | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const create = useCallback(
    async (input: { place: PlaceDto | null; name: string; businessNumber: string; headcountBand: HeadcountBand }) => {
      setPending(true);
      setErrorMessage(null);
      try {
        setCreated(
          await apiFetch<CreateStoreResultDto>('/api/v1/stores', {
            method: 'POST',
            body: JSON.stringify({
              name: input.name,
              address: input.place?.roadAddress ?? input.place?.address ?? undefined,
              latitude: input.place?.latitude,
              longitude: input.place?.longitude,
              place: input.place ? { provider: input.place.provider, placeId: input.place.placeId } : undefined,
              businessNumber: input.businessNumber || undefined,
              headcountBand: input.headcountBand,
            }),
          }),
        );
      } catch (error) {
        setErrorMessage(messageOf(error));
      } finally {
        setPending(false);
      }
    },
    [],
  );

  return { created, errorMessage, pending, create };
}
