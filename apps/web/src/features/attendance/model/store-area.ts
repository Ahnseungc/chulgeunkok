/** 매장 좌표에서 이 거리를 넘으면 "매장 밖". docs/specs/attendance §4 (인덱스 Q4: 가정값) */
export const OUTSIDE_AREA_RADIUS_M = 200;
/** 위치 정확도가 이보다 나쁘면 판정하지 않는다 */
export const MAX_RELIABLE_ACCURACY_M = 100;

const EARTH_RADIUS_M = 6_371_000;

interface Coordinates {
  latitude: number;
  longitude: number;
}

/**
 * 출근 위치가 매장 밖인지. 판정할 수 없으면 null (차단 용도로 쓰지 않는다).
 * - 매장 좌표 없음 / 출근 위치 없음 / 정확도 100m 초과 → null
 */
export function isOutsideStoreArea(
  store: { latitude: number | null; longitude: number | null },
  location: (Coordinates & { accuracyM: number }) | null,
): boolean | null {
  if (store.latitude == null || store.longitude == null || !location) return null;
  if (location.accuracyM > MAX_RELIABLE_ACCURACY_M) return null;
  const storeCoordinates = { latitude: store.latitude, longitude: store.longitude };
  return distanceMeters(storeCoordinates, location) > OUTSIDE_AREA_RADIUS_M;
}

/** haversine 거리 */
export function distanceMeters(a: Coordinates, b: Coordinates): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.latitude)) * Math.cos(toRadians(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}
