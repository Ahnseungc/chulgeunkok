import { describe, expect, it, vi } from 'vitest';

import { searchPlaces } from './kakao-local';
import { lookupBusinessStatus } from './nts-business-status';

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const kakaoDocument = (overrides: Record<string, string>) => ({
  id: '1',
  place_name: '가게',
  category_name: '',
  category_group_code: '',
  phone: '',
  address_name: '서울 마포구 망원동 1',
  road_address_name: '',
  x: '126.9',
  y: '37.5',
  ...overrides,
});

describe('searchPlaces (카카오 로컬)', () => {
  it('REST 키를 KakaoAK 헤더로 보낸다', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ documents: [] }));
    await searchPlaces('골목', { apiKey: 'key', fetchImpl });
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({ headers: { authorization: 'KakaoAK key' } });
  });

  it('카페·음식점을 다른 업종보다 위로 올리고 좌표를 숫자로 바꾼다', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        documents: [
          kakaoDocument({ id: 'cvs', category_group_code: 'CS2' }),
          kakaoDocument({ id: 'cafe', category_group_code: 'CE7', x: '126.9019', y: '37.5556' }),
        ],
      }),
    );
    const places = await searchPlaces('골목', { apiKey: 'key', fetchImpl });
    expect(places.map((place) => [place.placeId, place.latitude])).toEqual([
      ['cafe', 37.5556],
      ['cvs', 37.5],
    ]);
  });

  it('빈 문자열 필드는 null로 바꾼다', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ documents: [kakaoDocument({})] }));
    const [place] = await searchPlaces('가게', { apiKey: 'key', fetchImpl });
    expect([place?.roadAddress, place?.phone]).toEqual([null, null]);
  });

  it('카카오가 오류를 주면 PLACE_SEARCH_FAILED', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ message: 'bad' }, 401));
    await expect(searchPlaces('골목', { apiKey: 'key', fetchImpl })).rejects.toMatchObject({
      code: 'PLACE_SEARCH_FAILED',
    });
  });
});

describe('lookupBusinessStatus (국세청)', () => {
  const ntsResponse = (code: string) =>
    jsonResponse({ data: [{ b_no: '1234567891', b_stt_cd: code, tax_type: '부가가치세 일반과세자' }] });

  it.each([
    ['01', 'ACTIVE'],
    ['02', 'SUSPENDED'],
    ['03', 'CLOSED'],
    ['', 'NOT_FOUND'],
  ])('상태 코드 %s → %s', async (code, status) => {
    const fetchImpl = vi.fn().mockResolvedValue(ntsResponse(code));
    const result = await lookupBusinessStatus('1234567891', { serviceKey: 'a/b+c', fetchImpl });
    expect(result.status).toBe(status);
  });

  it('serviceKey를 URL 인코딩하고 번호를 body로 보낸다', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ntsResponse('01'));
    await lookupBusinessStatus('1234567891', { serviceKey: 'a/b+c', fetchImpl });
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect([String(url).endsWith('serviceKey=a%2Fb%2Bc'), init?.body]).toEqual([
      true,
      JSON.stringify({ b_no: ['1234567891'] }),
    ]);
  });

  it('네트워크 실패는 BUSINESS_LOOKUP_FAILED', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    await expect(
      lookupBusinessStatus('1234567891', { serviceKey: 'k', fetchImpl }),
    ).rejects.toMatchObject({ code: 'BUSINESS_LOOKUP_FAILED' });
  });
});
