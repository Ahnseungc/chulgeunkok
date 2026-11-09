---
name: zod-validation-first
description: >-
  출근콕 Zod 검증 워크플로: /api/v1 body·query 는 features/<domain>/schema.ts + defineRoute,
  공용 값은 shared/schema/common.ts, 외부 API 응답·앱 메시지는 safeParse. Use when user mentions
  zod, schema, validation, 유효성 검사, 폼 검증, 파라미터 검증, API 응답 검증.
---

# Zod Validation First — 스킬

원본 규칙: `.cursor/rules/zod-validation-first.mdc`

## 1. 새 API 입력

1. `features/<domain>/schema.ts` 에 스키마 + 타입

```ts
export const UpdateMemberBody = z
  .object({ role: InvitableRole.optional(), status: z.literal('INACTIVE').optional() })
  .refine((value) => Object.keys(value).length > 0, { message: '바꿀 값을 입력해 주세요.' });
export type UpdateMemberInput = z.infer<typeof UpdateMemberBody>;
```

2. 공용 값은 `shared/schema/common.ts` 재사용 (`KoreanMobilePhone`, `LocalDate`, `IsoDateTime`, `Reason`, `IdempotencyKey`, `HeadcountBand`).
3. 라우트: `defineRoute({ body: UpdateMemberBody }, async ({ body }) => ...)` — 실패는 자동 `400 VALIDATION_FAILED` + `details`.
4. 스키마 테스트: 정상·거부 각 1개 이상 (`labor/schema.test.ts` 참고).

## 2. 외부 응답

```ts
const parsed = KakaoKeywordResponse.safeParse(json);
if (!parsed.success) throw new ApiError('PLACE_SEARCH_FAILED');
```

## 3. 웹 ↔ 앱

`packages/app-bridge` 에 `z.discriminatedUnion('type', [...])` 로 추가 → `parseWebToApp`/`parseAppToWeb` 로만 읽기 → `index.test.ts`.

## 4. 하지 않는 것

- 우리 서버 DTO 응답을 클라이언트에서 재검증 (필요해지면 `apiFetch` 의 ponytail 주석을 먼저 본다)
- 클라이언트 폼 라이브러리 도입
