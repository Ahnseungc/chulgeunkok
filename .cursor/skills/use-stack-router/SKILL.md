---
name: use-stack-router
description: >-
  출근콕 사장님 매장 화면(/owner/[storeId]/**)의 스택 네비게이션을 @ahnseungchan/webviewkit 2.3 으로 연결한다.
  새 화면 Activity 등록, AppLink/AppBackLink/useBackTo, keepAlive + useOnRevive, resetPush/replace.
  Use when adding or fixing screen transitions, back links, OwnerStackApp, 스택, push, back, 뒤로가기,
  keepAlive, 되살아난 화면이 옛 데이터, Link/router.push 가 스택을 건너뛸 때.
---

# 스택 네비게이션 (webviewkit 2.3) — 스킬

원본 규칙: `.cursor/rules/use-stack-router.mdc`
라이브러리 README: `apps/web/node_modules/@ahnseungchan/webviewkit/README.md`

## A. 새 매장 하위 화면

1. 화면: `apps/web/src/features/<domain>/ui/XxxScreen.tsx` (`'use client'`, props `storeId` + id).
2. 등록: `apps/web/src/features/owner-stack/ui/OwnerStackApp.tsx`

```tsx
const XxxDetail = ({ storeId }: OwnerStackAppProps) => {
  const { xxxId } = useParams<{ xxxId: string }>();
  return <XxxDetailScreen storeId={storeId} xxxId={xxxId} />;
};
// activities
{ path: '/owner/:storeId/xxx', element: <XxxScreen storeId={storeId} />, keepAlive: true },   // 목록
{ path: '/owner/:storeId/xxx/:xxxId', element: <XxxDetail storeId={storeId} /> },
```

3. 딥링크용 라우트: `apps/web/src/app/owner/[storeId]/xxx/page.tsx` (기존 `members/page.tsx` 복사).
4. 진입 링크: 상위 화면에 `<AppLink href={`/owner/${storeId}/xxx`}>`.
5. 상단: `<AppBackLink href={`/owner/${storeId}`} className="back-link">← 매장 홈</AppBackLink>`.

## B. 동작 고르기

| 원하는 것 | 코드 |
|-----------|------|
| 하위로 | `AppLink` (스택 밖이면 next/link 로 자동 폴백) |
| 상위로 | `AppBackLink` / `useBackTo()(href)` |
| 저장 후 상세 → 목록 | `useBackTo()` |
| 완료 화면, 중간 단계 제거 | `useStackRouter().resetPush(path)` 또는 `replace(path)` |
| 쿼리 필터 | 상태로 처리, 첫 값은 `useActivity().query` |
| 공용 컴포넌트에서 스택 여부 | `useOptionalStackRouter()` |

## C. keepAlive 목록이 옛 데이터

```tsx
useOnRevive(() => void reload());
```

최초 마운트에는 호출되지 않는다. 스택 밖에서는 아무것도 안 한다.

## D. 확인

```
- [ ] Activity path 와 app/ 라우트가 같은 모양
- [ ] 스택 안에서 next/link·router.push 미사용
- [ ] 새로고침·딥링크로 열면 [매장 홈, 대상] 으로 복원되고 back 이 매장 홈으로
- [ ] 목록 back → 스크롤·필터 유지, 데이터는 갱신
- [ ] iOS 스와이프 백 / Android back 버튼 (RN 앱)
- [ ] pnpm typecheck (typedRoutes 가 href 를 검사)
```

개발 중 스택 상태가 궁금하면 `StackRouterProvider` 에 `enableDevTools` 를 잠깐 켠다 (커밋하지 않는다).
