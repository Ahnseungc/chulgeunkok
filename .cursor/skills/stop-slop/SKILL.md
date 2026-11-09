---
name: stop-slop
description: >-
  AI 문체(슬롭)를 줄인다. UI 카피·스펙·PR 본문·docs 초안/교정 시에만 사용.
  전역 채팅·코드 구현에는 강제하지 않는다. stop-slop, 문체, 카피 다듬기, 슬롭 제거.
---

# Stop Slop (출근콕)

원본: [hardikpandya/stop-slop](https://github.com/hardikpandya/stop-slop) (MIT).  
**적용 범위**: 제품 카피(화면 문구·`server/http/error-codes.ts` 메시지), `docs/`, `docs/specs/**`, PR 문구.  
**비적용**: 일상 코딩 응답(기존 `communication-preferences`만), 코드 식별자, 커밋 type 접두사.

## 사용 전

1. 사용자가 카피·문서·PR 문장 다듬기를 요청했는지 확인한다.
2. 상세 패턴은 필요할 때만 `references/` 를 읽는다.

## 핵심 규칙

1. **군더더기 삭제** — “핵심은”, “결국”, “중요한 점은”, “Here’s the thing”, “It turns out” 등 예고 문구 제거. → [phrases.md](references/phrases.md)
2. **공식 구조 피하기** — “X가 아니라 Y”, “Not X. It’s Y.” 대신 Y만 말한다. → [structures.md](references/structures.md)
3. **능동·구체** — 주어를 밝히고, “구조적이다/중요하다” 같은 추상 선언 대신 대상을 이름 붙인다.
4. **리듬** — 문장 길이를 섞는다. 연속 같은 길이·끝맺음 펀치 라인 남발 금지.
5. **독자 신뢰** — 과한 완충·변명·핸드홀딩 생략.
6. **한국어 AI 티** — `~할 수 있습니다` 남발, `다양한/효과적인/원활한` 빈말, `다음과 같습니다:` 장황한 예고 줄이기.

## 팀 규칙과 충돌 시

| 우선 | 문서 |
|------|------|
| 한국어·간결 응답 | `.cursor/rules/communication-preferences.mdc` |
| PR 본문 형식 | `github-pr-description` 스킬 |
| 커밋 메시지 | `commit-convention` (`feat: 한글`) |

stop-slop과 충돌하면 **위 팀 규칙을 유지**하고, 슬롭만 깎는다.

## 전달 전 체크

- 예고 문장 / not-X-but-Y / 빈 부사·강조 클리셰 있는가?
- 구체적 대상·경로·스펙 절이 있는가?
- 화면 문구는 기존 톤(`~해요`, `~해 주세요`)인가?
- 영어 em dash(`—`) 남발인가? (가능하면 쉼표·마침표)

예시: [examples.md](references/examples.md)  
라이선스: [LICENSE](references/LICENSE)
