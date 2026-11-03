import { ApiError } from '@/server/http/api-error';

/**
 * 외부 API 키가 없을 때 개발용 대체 구현을 써도 되는지.
 * production에서 키가 빠졌으면 조용히 가짜 응답을 주지 않고 INTERNAL로 실패한다.
 */
export function assertDevFallbackAllowed(integration: string): void {
  if (process.env.NODE_ENV === 'production') {
    console.error(`[integrations] ${integration} 설정이 없어요 (production)`);
    throw new ApiError('INTERNAL');
  }
}
