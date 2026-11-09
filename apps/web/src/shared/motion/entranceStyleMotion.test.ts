import { describe, expect, it } from 'vitest';

import {
  ENTRANCE_STYLE_DELAY,
  ENTRANCE_STYLE_STAGGER_STEP_S,
  entranceStyleStaggerDelay,
} from './entranceStyleMotion';

describe('entranceStyleMotion', () => {
  it('entranceStyleStaggerDelay는 base + index * step을 반환한다', () => {
    expect(entranceStyleStaggerDelay(0, ENTRANCE_STYLE_DELAY.firstRow)).toBe(0.12);
    expect(entranceStyleStaggerDelay(2, ENTRANCE_STYLE_DELAY.secondRow)).toBe(
      0.2 + 2 * ENTRANCE_STYLE_STAGGER_STEP_S,
    );
  });
});
