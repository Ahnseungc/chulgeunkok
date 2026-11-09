---
name: clean-code-quality
description: >-
  출근콕 클린 코드 체크리스트: 의미 있는 이름, 매직 넘버 상수화, SRP·작은 함수(로직 20~30줄),
  인자 ≤ 3 (서비스는 (db, input)), 조건 Depth ≤ 2·Record 맵, 완료 전 pnpm typecheck / pnpm test.
  Use when writing or refactoring TS/TSX, code review, 클린 코드, 매직 넘버, SRP, 함수 분리,
  guard clause, Definition of Done, 타입체크.
---

# Clean Code Quality — 스킬

규칙 원본: `.cursor/rules/clean-code-quality.mdc`

## 작성 중

```
- [ ] 이름이 역할을 말한다 (tmp/data2 없음)
- [ ] 도메인 숫자·문자열은 상수 (법정 기준값은 features/labor/model·DB 규칙에서)
- [ ] 색은 Seed 토큰, 임의 Hex 없음
- [ ] 로직 함수 20~30줄 안팎, 인자 ≤ 3 (서비스는 (db, input))
- [ ] 분기는 early return / Record 맵, 중첩 ≤ 2
- [ ] 실패 경로 처리 (exception-handling)
```

## 완료 전 (루트에서)

```bash
pnpm typecheck
pnpm test                                   # 또는
pnpm --filter @chulgeunkok/web test -- <파일>
pnpm db:verify                              # 마이그레이션·제약 변경 시
```

- 린트 스크립트는 없다. 실행했다고 쓰지 않는다.
- 실패하면 이번 변경 관련 오류부터 고치고 다시 돌린다.
- 못 돌렸으면 이유를 응답에 적는다.

## 리뷰 때 자주 잡는 것

- 화면에서 근무시간·금액을 다시 계산 → `model/` 함수 사용
- 서비스가 Prisma 모델을 그대로 반환 → DTO 변환
- 같은 라벨 맵이 두 화면에 → `*-labels.ts` 로

관련: `.cursor/skills/ponytail/SKILL.md`, `.cursor/skills/exception-handling/SKILL.md`
