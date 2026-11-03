import { NextResponse, type NextRequest } from 'next/server';
import { ZodError, type ZodType } from 'zod';

import { getSessionUserId } from '@/server/auth/session';

import { ApiError, type ApiErrorBody } from './api-error';

type RouteParams = Record<string, string>;

interface RouteContext<TBody, TQuery, TParams extends RouteParams> {
  req: NextRequest;
  params: TParams;
  body: TBody;
  query: TQuery;
  /** `auth: 'public'` 이면 null */
  userId: string | null;
}

interface RouteOptions<TBody, TQuery> {
  /** 기본 'user'. 'public'은 세션 없이 호출 가능 */
  auth?: 'user' | 'public';
  body?: ZodType<TBody, any, unknown>;
  query?: ZodType<TQuery, any, unknown>;
}

type Handler<TBody, TQuery, TParams extends RouteParams> = (
  ctx: RouteContext<TBody, TQuery, TParams>,
) => Promise<Response | unknown>;

/**
 * Route Handler 공통 래퍼.
 * - 세션 확인 → body/query Zod 검증 → 핸들러
 * - ApiError·ZodError·그 외 예외를 docs/specs/README.md §2.3 포맷으로 변환
 * - 핸들러가 Response가 아닌 값을 돌려주면 200 JSON
 */
export function defineRoute<
  TBody = undefined,
  TQuery = undefined,
  TParams extends RouteParams = RouteParams,
>(options: RouteOptions<TBody, TQuery>, handler: Handler<TBody, TQuery, TParams>) {
  return async (req: NextRequest, segment: { params: Promise<TParams> }) => {
    try {
      const userId = options.auth === 'public' ? null : await getSessionUserId(req);
      const body = options.body ? options.body.parse(await readJson(req)) : (undefined as TBody);
      const query = options.query
        ? options.query.parse(Object.fromEntries(req.nextUrl.searchParams))
        : (undefined as TQuery);
      const params = await segment.params;

      const result = await handler({ req, params, body, query, userId });
      return result instanceof Response ? result : NextResponse.json(result);
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}

async function readJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch (error) {
    throw new ApiError('VALIDATION_FAILED', {
      message: '요청 본문이 올바른 JSON이 아니에요.',
      details: error instanceof Error ? error.message : undefined,
    });
  }
}

export function toErrorResponse(error: unknown): NextResponse<ApiErrorBody> {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message, details: error.details } },
      { status: error.status },
    );
  }
  if (error instanceof ZodError) {
    const apiError = new ApiError('VALIDATION_FAILED', { details: error.flatten() });
    return toErrorResponse(apiError);
  }
  // ponytail: 관측 도구(Sentry 등) 연결 전까지 서버 로그로만 남긴다
  console.error('[api] unhandled error', error);
  return toErrorResponse(new ApiError('INTERNAL'));
}
