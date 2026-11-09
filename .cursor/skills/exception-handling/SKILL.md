---
name: exception-handling
description: >-
  출근콕 로직 변경 시 실패 경로 필수: 서버는 ApiError throw → defineRoute 변환, 클라이언트는
  apiFetch 의 ApiRequestError → errorMessageOf → 인라인 role=alert 문구. 빈 catch 금지.
  Use when writing logic, API, services, hooks, catch, 예외처리, 에러처리, try/catch, 실패 경로.
---

# Exception Handling — 스킬

규칙 원본: `.cursor/rules/exception-handling.mdc`

## 1. 어디서 실패하나 고르기

| 위치 | 하는 일 |
|------|---------|
| 서비스 `features/<domain>/server/*` | 조건 불충족 → `throw new ApiError('CODE', { details })`. try/catch 로 감싸지 않음 |
| 외부 연동 `server/integrations/*` | `safeParse` 실패·타임아웃 → 도메인 코드 (`PLACE_SEARCH_FAILED`) |
| 라우트 | `defineRoute` 가 처리. 추가 코드 없음 |
| 조회 훅 | `useApiResource` → `errorMessage` |
| 액션 훅 | `try { await apiFetch } catch (e) { setMessage({ text: errorMessageOf(e), error: true }) } finally { setPending(false) }` |
| 코드별 분기 | `error instanceof ApiRequestError && error.code === '...'` (+ `error.details`) |
| 앱 메시지·JSON 파싱 | 실패 시 `null` 반환 + 이유 주석 |

## 2. 새 에러 코드

1. `apps/web/src/server/http/error-codes.ts` 에 `{ status, message }` (사용자 노출 한국어)
2. `docs/specs/<domain>/README.md` "에러 코드" 절에 추가
3. 서비스 테스트에 `rejects.toMatchObject({ code: '...' })` 케이스

## 3. 화면 표시

```tsx
{errorMessage ? (
  <Text as="p" textStyle="t5Regular" color="fg.critical" role="alert">
    {errorMessage}
  </Text>
) : null}
```

토스트·`error.tsx`·전역 스피너는 없다. 필요하면 만들기 전에 제안한다 (Seed 에 `Snackbar` 가 있다).

## 4. 체크

```
- [ ] 빈 catch 없음 / catch (e: any) 없음
- [ ] 사용자 액션 실패에 화면 피드백 있음
- [ ] pending 은 finally 에서 해제
- [ ] 서버 실패는 ApiError, 문구는 error-codes.ts
- [ ] 실패 케이스 테스트
```
