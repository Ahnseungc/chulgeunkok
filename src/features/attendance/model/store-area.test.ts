import { describe, expect, it } from 'vitest';

import { distanceMeters, isOutsideStoreArea } from './store-area';

// 서울시청 근처
const store = { latitude: 37.5665, longitude: 126.978 };
// 위도 0.001도 ≈ 111m
const nearby = { latitude: 37.5675, longitude: 126.978, accuracyM: 20 };
const farAway = { latitude: 37.5705, longitude: 126.978, accuracyM: 20 };

describe('distanceMeters', () => {
  it('위도 0.001도는 약 111m다', () => {
    expect(Math.round(distanceMeters(store, nearby))).toBe(111);
  });
});

describe('isOutsideStoreArea', () => {
  it('200m 안이면 false', () => {
    expect(isOutsideStoreArea(store, nearby)).toBe(false);
  });

  it('200m 밖이면 true', () => {
    expect(isOutsideStoreArea(store, farAway)).toBe(true);
  });

  it('정확도가 100m를 넘으면 판정하지 않는다', () => {
    expect(isOutsideStoreArea(store, { ...farAway, accuracyM: 300 })).toBeNull();
  });

  it('매장 좌표가 없으면 판정하지 않는다', () => {
    expect(isOutsideStoreArea({ latitude: null, longitude: null }, farAway)).toBeNull();
  });

  it('출근 위치가 없으면 판정하지 않는다', () => {
    expect(isOutsideStoreArea(store, null)).toBeNull();
  });
});
