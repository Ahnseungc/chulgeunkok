---
name: review-bugbot
description: >-
  Bugbot 서브에이전트로 로컬 diff를 리뷰한다. /review-bugbot, Bugbot, 버그봇, 코드 리뷰(버그), PR 리뷰 요청 시 사용.
  수정은 사용자가 요청할 때만.
---

# Review Bugbot (출근콕)

Cursor `bugbot` 서브에이전트를 한 번 실행한다. diff 는 서브에이전트가 계산하므로 미리 `git diff` 를 넘기지 않는다.

## 실행

- `subagent_type: "bugbot"`, `description: "Bugbot"`, `run_in_background: false` (요청 시에만 true)
- 프롬프트:

```text
Full Repository Path: <워크스페이스 절대 경로>
Diff: <"branch changes" | "uncommitted changes" | "natural language">
Base Branch: <필요 시만. 기본 main>
Change Description: <Diff가 natural language일 때만>
Custom Instructions: <사용자 추가 지시가 있을 때만>
```

기본 `Diff: branch changes`, base `main`. 미커밋만이면 `uncommitted changes`.

## 출근콕에서 특히 볼 것 (Custom Instructions 로 넣어도 됨)

- 서비스 권한 확인(`requireMembership`) 누락, 다른 매장 리소스 노출
- 시간대·주 경계·원 단위 올림 (`docs/specs/README.md` §2.1·§2.2)
- 상태 전이 동시성 (조건부 update·트랜잭션)
- 스택 안에서 `next/link`·`router.push` 사용

## 결과

요약은 한국어. findings 는 Severity / Location(`file:line`) / Finding 표. 찾은 이슈를 자동으로 고치지 않는다.

## 실패 시

프롬프트 교정 후 1회 재시도. diff 계산 불가면 `natural language` + Change Description 으로 1회. 그래도 실패면 중단하고 사유만.
