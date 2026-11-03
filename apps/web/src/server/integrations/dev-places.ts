import type { PlaceDto } from '@/features/store/model/place-types';

/** KAKAO_REST_API_KEY가 없을 때 개발용 검색 결과. 실제 가게가 아닌 예시 데이터다 */
export const DEV_PLACES: readonly PlaceDto[] = [
  {
    provider: 'KAKAO',
    placeId: 'dev-1001',
    name: '골목카페 망원점',
    category: '음식점 > 카페',
    roadAddress: '서울 마포구 망원로 1',
    address: '서울 마포구 망원동 1-1',
    phone: null,
    latitude: 37.5556,
    longitude: 126.9019,
  },
  {
    provider: 'KAKAO',
    placeId: 'dev-1002',
    name: '골목분식',
    category: '음식점 > 분식',
    roadAddress: '서울 마포구 망원로 2',
    address: '서울 마포구 망원동 2-1',
    phone: null,
    latitude: 37.5559,
    longitude: 126.9025,
  },
  {
    provider: 'KAKAO',
    placeId: 'dev-1003',
    name: '달빛포차',
    category: '음식점 > 술집',
    roadAddress: '서울 마포구 포은로 3',
    address: '서울 마포구 망원동 3-1',
    phone: null,
    latitude: 37.5548,
    longitude: 126.9041,
  },
];
