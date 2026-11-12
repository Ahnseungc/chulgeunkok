import { describe, expect, it } from 'vitest';

import { SaveQrDesignBody } from './schema';

const valid = { layout: 'STAND', color: 'kok', title: '골목카페', message: '안내' } as const;

describe('SaveQrDesignBody', () => {
  it('color가 프리셋이 아니면 실패', () => {
    expect(SaveQrDesignBody.safeParse({ ...valid, color: 'pink' }).success).toBe(false);
  });
  it('21자 title 실패', () => {
    expect(SaveQrDesignBody.safeParse({ ...valid, title: 'a'.repeat(21) }).success).toBe(false);
  });
  it('41자 message 실패', () => {
    expect(SaveQrDesignBody.safeParse({ ...valid, message: 'a'.repeat(41) }).success).toBe(false);
  });
  it('빈 message·공백 제거된 title 통과', () => {
    const parsed = SaveQrDesignBody.parse({ ...valid, title: ' 카페 ', message: '' });
    expect(parsed.title).toBe('카페');
  });
});
