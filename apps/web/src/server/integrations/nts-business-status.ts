import { withTimeout } from 'es-toolkit';
import { z } from 'zod';

import { ApiError } from '@/server/http/api-error';

import { assertDevFallbackAllowed } from './dev-fallback';

/** 국세청 사업자등록 상태조회 (공공데이터포털). docs/specs/store §3.2 */
const NTS_STATUS_URL = 'https://api.odcloud.kr/api/nts-businessman/v1/status';
const NTS_TIMEOUT_MS = 5000;

export const BUSINESS_STATUSES = ['ACTIVE', 'SUSPENDED', 'CLOSED', 'NOT_FOUND'] as const;
export type BusinessStatus = (typeof BUSINESS_STATUSES)[number];

const STATUS_BY_CODE = {
  '01': 'ACTIVE',
  '02': 'SUSPENDED',
  '03': 'CLOSED',
} as const satisfies Record<string, BusinessStatus>;

const NtsStatusResponse = z.object({
  data: z
    .array(
      z.object({
        b_no: z.string(),
        b_stt_cd: z.string(),
        tax_type: z.string().optional(),
      }),
    ),
});

export interface BusinessStatusResult {
  businessNumber: string;
  status: BusinessStatus;
  taxType: string | null;
}

/** 정규화·체크섬을 통과한 10자리 번호만 넘긴다 */
export async function lookupBusinessStatus(
  businessNumber: string,
  options: { serviceKey?: string; fetchImpl?: typeof fetch } = {},
): Promise<BusinessStatusResult> {
  const serviceKey = options.serviceKey ?? process.env.NTS_SERVICE_KEY;
  if (!serviceKey) {
    assertDevFallbackAllowed('NTS_SERVICE_KEY');
    return { businessNumber, status: 'ACTIVE', taxType: '개발용 응답' };
  }
  const json = await requestStatus(businessNumber, serviceKey, options.fetchImpl ?? fetch);
  const parsed = NtsStatusResponse.safeParse(json);
  if (!parsed.success) throw new ApiError('BUSINESS_LOOKUP_FAILED');
  const row = parsed.data.data[0];
  if (!row) throw new ApiError('BUSINESS_LOOKUP_FAILED');
  return {
    businessNumber,
    // 등록되지 않은 번호는 b_stt_cd가 빈 문자열로 온다
    status: STATUS_BY_CODE[row.b_stt_cd as keyof typeof STATUS_BY_CODE] ?? 'NOT_FOUND',
    taxType: row.tax_type || null,
  };
}

/** serviceKey는 공공데이터포털의 "Decoding" 키를 그대로 넣는다. 인코딩은 여기서 한다 */
async function requestStatus(
  businessNumber: string,
  serviceKey: string,
  fetchImpl: typeof fetch,
): Promise<unknown> {
  try {
    const response = await withTimeout(
      () =>
        fetchImpl(`${NTS_STATUS_URL}?serviceKey=${encodeURIComponent(serviceKey)}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({ b_no: [businessNumber] }),
        }),
      NTS_TIMEOUT_MS,
    );
    if (!response.ok) throw new Error(`NTS ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('[integrations] 국세청 상태조회 실패', error);
    throw new ApiError('BUSINESS_LOOKUP_FAILED');
  }
}
