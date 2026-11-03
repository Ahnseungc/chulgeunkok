import { withTimeout } from 'es-toolkit';
import { z } from 'zod';

import type { PlaceDto } from '@/features/store/model/place-types';
import { ApiError } from '@/server/http/api-error';

import { assertDevFallbackAllowed } from './dev-fallback';
import { DEV_PLACES } from './dev-places';

/** 카카오 로컬 키워드 검색. docs/specs/store §3.1 */
const KAKAO_KEYWORD_URL = 'https://dapi.kakao.com/v2/local/search/keyword.json';
const KAKAO_TIMEOUT_MS = 5000;
const MAX_RESULTS = 15;
/** 카페·음식점을 위로 */
const PRIORITY_CATEGORY_CODES: ReadonlySet<string> = new Set(['CE7', 'FD6']);

const KakaoKeywordResponse = z.object({
  documents: z.array(
    z.object({
      id: z.string(),
      place_name: z.string(),
      category_name: z.string(),
      category_group_code: z.string(),
      phone: z.string(),
      address_name: z.string(),
      road_address_name: z.string(),
      x: z.coerce.number(),
      y: z.coerce.number(),
    }),
  ),
});

type KakaoDocument = z.infer<typeof KakaoKeywordResponse>['documents'][number];

export async function searchPlaces(
  query: string,
  options: { apiKey?: string; fetchImpl?: typeof fetch } = {},
): Promise<PlaceDto[]> {
  const apiKey = options.apiKey ?? process.env.KAKAO_REST_API_KEY;
  if (!apiKey) {
    assertDevFallbackAllowed('KAKAO_REST_API_KEY');
    return DEV_PLACES.filter((place) => place.name.includes(query.trim()));
  }
  const parsed = KakaoKeywordResponse.safeParse(
    await requestKeyword(query, apiKey, options.fetchImpl ?? fetch),
  );
  if (!parsed.success) throw new ApiError('PLACE_SEARCH_FAILED');
  return sortByPriority(parsed.data.documents).map(toPlaceDto);
}

function sortByPriority(documents: KakaoDocument[]): KakaoDocument[] {
  const rank = (document: KakaoDocument) =>
    PRIORITY_CATEGORY_CODES.has(document.category_group_code) ? 0 : 1;
  // Array.prototype.sort는 안정 정렬이라 같은 순위 안에서는 카카오 정확도 순서가 유지된다
  return [...documents].sort((a, b) => rank(a) - rank(b));
}

function toPlaceDto(document: KakaoDocument): PlaceDto {
  return {
    provider: 'KAKAO',
    placeId: document.id,
    name: document.place_name,
    category: document.category_name || null,
    roadAddress: document.road_address_name || null,
    address: document.address_name || null,
    phone: document.phone || null,
    latitude: document.y,
    longitude: document.x,
  };
}

async function requestKeyword(query: string, apiKey: string, fetchImpl: typeof fetch) {
  const url = `${KAKAO_KEYWORD_URL}?${new URLSearchParams({ query, size: String(MAX_RESULTS) })}`;
  try {
    const response = await withTimeout(
      () => fetchImpl(url, { headers: { authorization: `KakaoAK ${apiKey}` } }),
      KAKAO_TIMEOUT_MS,
    );
    if (!response.ok) throw new Error(`Kakao ${response.status}`);
    return (await response.json()) as unknown;
  } catch (error) {
    console.error('[integrations] 카카오 로컬 검색 실패', error);
    throw new ApiError('PLACE_SEARCH_FAILED');
  }
}
