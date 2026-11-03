/** 가게 검색 결과. docs/specs/store §3.1 */
export interface PlaceDto {
  provider: 'KAKAO';
  placeId: string;
  name: string;
  category: string | null;
  roadAddress: string | null;
  address: string | null;
  phone: string | null;
  latitude: number;
  longitude: number;
}

export interface BusinessVerificationDto {
  businessNumber: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'CLOSED' | 'NOT_FOUND';
  taxType: string | null;
}

export interface CreateStoreResultDto {
  store: { id: string; name: string };
  qr: { url: string };
}
