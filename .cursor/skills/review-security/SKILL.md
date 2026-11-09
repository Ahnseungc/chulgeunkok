---
name: review-security
description: >-
  Security Review 서브에이전트로 로컬 diff를 점검한다. /review-security, 보안 리뷰, security review,
  XSS·시크릿·인증 점검 요청 시 사용. 수정은 요청 시에만.
---

# Review Security (출근콕)

Cursor `security-review` 서브에이전트를 한 번 실행한다. diff 는 서브에이전트가 계산한다.

## 실행

- `subagent_type: "security-review"`, `description: "Security Review"`, `run_in_background: false`
- 프롬프트:

```text
Full Repository Path: <워크스페이스 절대 경로>
Diff: <"branch changes" | "uncommitted changes">
Base Branch: <필요 시만. 기본 main>
Custom Instructions: <사용자 추가 지시가 있을 때만>
```

## 체크 힌트 (Custom Instructions 에 넣어도 됨)

- `.env*`·`KAKAO_REST_API_KEY`·`NTS_SERVICE_KEY`·`CRON_SECRET` 노출, `NEXT_PUBLIC_` 오용
- 초대·QR·기기 토큰 평문 저장·로그·URL 노출 (DB 에는 해시만)
- `DEV_AUTH`·개발용 응답이 production 에서 켜지는 경로
- 권한 매트릭스(`docs/specs/README.md` §2.5) 우회, 다른 매장 리소스 `NOT_FOUND` 누락
- WebView 브릿지 신뢰 경계: `parseWebToApp` 검증, `toAppPath` 허용 경로, `onShouldStartLoadWithRequest`
- `/auth/restore?next=` open redirect
- 팀 규칙: `.cursor/rules/security-env.mdc`

## 결과

한국어 한 줄 상태 + findings 표(Severity, Location, Finding). 자동 수정 금지.
