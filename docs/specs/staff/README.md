# 직원 초대·관리 — 기능 스펙

| 항목 | 값 |
| --- | --- |
| 상태 | **Draft** (2026-11-03) |
| PRD | [§2, §3.2, §4 STAFF-01·02](../../prd-v0.4.md) |
| 인덱스 | [../README.md](../README.md) |

---

## 1. 개요

1. 직원은 **로그인하지 않는다.** 사장님(또는 Manager)이 보낸 초대 링크를 한 번 열면 그 휴대폰이 등록된다 (`auth` §3).
2. 초대는 두 종류다.
   - **새 직원 초대** (`JOIN`): 이름을 입력하고 수락하면 User·Membership·기기가 생긴다.
   - **기기 재등록** (`REREGISTER`): 기존 직원을 지정해 만든다. 폰을 바꿨거나 퇴사 후 복귀할 때. 수락한 기기가 그 직원의 유일한 기기가 된다.
3. 수락 직후 근로조건이 없으면 출근할 수 없다 (`attendance` §3 `TERMS_NOT_SET`). 사장님 화면에 "근로조건 등록 필요"가 뜬다.
4. 퇴사는 비활성화. 기록은 남고 과금에서 빠진다.

> 초대 링크를 가진 사람은 누구든 한 번 수락할 수 있다. 본인 확인은 "사장님이 그 사람에게 직접 보냈다"에 기댄다. 링크는 1회용·7일 만료이고, 잘못 수락되면 사장님이 기기 재등록으로 되돌린다.

## 2. 범위 / 비목표

| 포함 | 제외 |
| --- | --- |
| 새 직원 초대, 기기 재등록 | 직원 휴대폰 인증 (MVP 없음) |
| 초대 취소 | 문자·알림톡 자동 발송 (P1, MVP는 공유 시트) |
| 비활성화·재등록으로 복귀 | 엑셀 일괄 등록, 직원 영구 삭제 |
| Manager 지정·권한 위임 | 매장 소유권 이전 |

## 3. 초대

### 3.1 생성

```ts
const CreateInvitationBody = z.union([
  z.object({ kind: z.literal('JOIN'), role: z.enum(['EMPLOYEE', 'MANAGER']).default('EMPLOYEE') }),
  z.object({ kind: z.literal('REREGISTER'), memberId: z.string() }),
]).and(z.object({ delivery: z.enum(['QR', 'LINK']).default('QR') }));
```

| `delivery` | 쓰는 법 | 유효 기간 |
| --- | --- | --- |
| `QR` (기본) | 사장님 앱이 QR로 띄우고 직원이 그 자리에서 찍는다 | **10분** |
| `LINK` | 카톡 등으로 링크 전송 | 7일 |

얼굴을 보고 찍는 QR이 링크보다 안전하므로 기본값이다. 매장 벽의 출근 QR로는 기기를 등록하지 않는다 (누구나 찍을 수 있어 대리 출근을 막지 못한다).

| 규칙 | 에러 |
| --- | --- |
| Manager는 `JOIN`+`EMPLOYEE`, `REREGISTER`는 EMPLOYEE 대상만 | `FORBIDDEN` |
| `REREGISTER` 대상이 이 매장 Membership이 아님 | `NOT_FOUND` |
| `REREGISTER` 대상이 OWNER | `FORBIDDEN` (사장님 기기는 휴대폰 인증으로 등록, `auth` §4) |

- 토큰: 32바이트 base64url, 해시 저장, **1회용**, 만료는 위 표.
- 응답 `{ url: 'https://<도메인>/invite/<token>', expiresAt }`. 화면은 Web Share API(실패 시 링크 복사).

### 3.2 조회 `GET /invitations/:token` (공개)

```ts
interface InvitationInfo {
  kind: 'JOIN' | 'REREGISTER';
  storeName: string;
  inviterName: string;
  role: 'EMPLOYEE' | 'MANAGER';
  memberName: string | null;  // REREGISTER 대상 이름
  needsName: boolean;         // JOIN이고 이 기기가 아직 등록되지 않았을 때 true
  expiresAt: string;
}
```

### 3.3 수락 `POST /invitations/:token/accept` (공개)

body `{ name?: string }` (1~20자). `needsName`이면 필수.

| 순서 | 조건 | 결과 |
| --- | --- | --- |
| 1 | 토큰 없음·폐기 | `404 INVITATION_INVALID` |
| 2 | 만료 | `410 INVITATION_EXPIRED` |
| 3 | `acceptedAt` 있음 | `409 INVITATION_USED` |
| 4 | `REREGISTER` | 대상 직원의 기존 기기 전부 폐기 → 이 기기 등록. 대상이 INACTIVE면 ACTIVE로 되돌림(`leftAt = null`, `permissions = []`) |
| 5 | `JOIN`, 이 기기가 이미 등록됨 | 그 User로 진행 (한 사람이 여러 매장에서 일하는 경우) |
| 6 | `JOIN`, 미등록 기기 | `name`으로 User 생성 + 기기 등록 |
| 7 | 5·6에서 이미 이 매장 ACTIVE 직원 | `409 ALREADY_MEMBER` |
| 8 | 5에서 이 매장 INACTIVE 직원 | 같은 Membership을 ACTIVE로 되돌림, 역할은 초대값, 위임 권한은 비움(`permissions = []`, 예전 권한을 되살리지 않는다) |
| 9 | 그 외 | Membership 생성 |

- 전부 한 트랜잭션. `acceptedAt IS NULL` 조건부 update로 동시 수락을 막는다. 실패하면 `acceptedAt`도 롤백된다.
- 기기를 새로 등록하면 응답에 기기 쿠키를 심는다 (`auth` §3.2).
- 응답 `{ storeId, storeName, role }`.
- 화면: 매장명, 초대한 사람, (`needsName`이면) 이름 입력, "등록하기". 완료 후 "이제 매장 QR을 찍으면 출근할 수 있어요."

### 3.4 취소

`revokedAt = now()`. 대기 중 초대 목록은 직원 목록 상단에 노출.

## 4. 직원 상태

```
ACTIVE ──비활성화──▶ INACTIVE ──기기 재등록 수락──▶ ACTIVE
```

### 4.1 비활성화

- Owner만. Owner 본인은 불가 (`409 CANNOT_DEACTIVATE_OWNER`).
- 진행 중(OPEN) 근무가 있으면 막는다: `409 MEMBER_HAS_OPEN_ATTENDANCE` "근무 중인 직원이에요. 퇴근 처리 후 비활성화해 주세요."
- 처리: `status = INACTIVE`, `leftAt = now()`, 현재 근로조건 `effectiveTo = now()`, 위임 권한 `permissions = []` (새 직원 초대로 복귀할 때 예전 급여 권한이 조용히 되살아나지 않게. 이력 `PERMISSIONS_CHANGED`).
- `leftAt`은 기록 보관 3년의 시작점이다 (PRD §9).
- 이 규칙 전에 비활성화된 직원의 남은 권한은 마이그레이션 `0011_inactive_permissions_reset`(데이터만)이 비운다.

### 4.2 역할·권한 변경

```ts
const UpdateMemberBody = z.object({
  role: z.enum(['EMPLOYEE', 'MANAGER']).optional(),
  permissions: z.array(z.enum(['PAYROLL_READ', 'TERMS_EDIT'])).optional(),
  status: z.literal('INACTIVE').optional(),
});
```

- `permissions`는 `role = MANAGER`일 때만 의미가 있다. EMPLOYEE로 내리면 비운다.
- Manager도 본인 근무는 출퇴근한다 (Manager = 직원 + 관리 권한).

### 4.3 변경 이력

역할·권한·상태가 바뀌면 `MembershipEvent`를 **변경과 같은 트랜잭션**에서 남긴다 (인덱스 §2.6, Q1). 지우거나 고치지 않는다.

| `type` | 남기는 곳 | `before` → `after` | `actorId` |
| --- | --- | --- | --- |
| `ROLE_CHANGED` | PATCH 역할 변경, `JOIN` 초대로 복귀하며 역할이 바뀜 (§3.3-8) | `{ role }` | 바꾼 사장님 / 초대한 사람 |
| `PERMISSIONS_CHANGED` | PATCH 권한 변경, EMPLOYEE로 내리거나 퇴사 처리해 권한이 비워짐, 복귀하며 남아 있던 권한이 비워짐 (§3.3-4·8) | `{ permissions }` | 바꾼 사장님 / 초대한 사람 |
| `DEACTIVATED` | 퇴사 처리 (§4.1) | `{ status }` | 바꾼 사장님 |
| `REACTIVATED` | INACTIVE 직원이 재등록·새 직원 초대를 수락 (§3.3-4·8) | `{ status }` | **초대한 사람** (복귀를 허락한 사람) |

- 한 요청에서 여러 값이 바뀌면 종류마다 1건씩 남긴다 (예: 매니저 → 직원 = `ROLE_CHANGED` + `PERMISSIONS_CHANGED`). 값이 그대로면 남기지 않는다.
- 변경이 실패하면(근무 중 퇴사 처리 등) 이력도 남지 않는다.
- 조회 `GET /stores/:storeId/members/:memberId/events` — **사장님만** (`MEMBER_ADMIN`). 최근 것 먼저. 응답 `{ events: { id, type, before, after, actorName, createdAt }[] }`.
- 화면: 직원 상세(§5.2) 맨 아래 "변경 이력". 한 줄에 문장 + 시각 · 바꾼 사람. 예: "역할을 직원에서 매니저로 바꿨어요", "맡긴 권한: 없음 → 급여 보기", "퇴사 처리했어요", "다시 일하게 됐어요". 이력이 없으면 "아직 바꾼 내용이 없어요."

## 5. 직원 목록·상세

### 5.1 목록 `/owner/[storeId]/members`

| 열 | 비고 |
| --- | --- |
| 이름, 역할 | |
| 상태 배지 | 근무 중 / 근로조건 필요 / 검토 필요 n건 / 비활성 |
| 이번 정산기간 근무시간 | |

필터: 활성(기본) / 비활성. 정렬: 근무 중 → 이름순.

### 5.2 상세 `/owner/[storeId]/members/[memberId]`

한 화면에 구역으로: **근로조건** (요약 + 등록·수정 → `…/terms`) · **확인할 안내** (`labor` §6, 들어올 때 안 본 안내가 있으면 바텀시트 1회) · **역할·권한** (사장님만, 아래) · **휴대폰** (기기 재등록 QR, 퇴사 처리) · **변경 이력** (사장님만, §4.3). 근태 기록 구역은 근태 화면 작업 때 추가.

- 근로조건 내용은 `TERMS_READ` 권한이 있을 때만 보이고, 수정 버튼은 `TERMS_WRITE`일 때만. 응답 `termsAccess`로 가른다:
  - `ALLOWED` — 요약을 보여 주고 검토 안내도 불러온다. 본인 근로조건은 늘 `ALLOWED`.
  - `PHONE_VERIFICATION_REQUIRED` — `PAYROLL_READ`로만 들어온 매니저가 휴대폰 인증 전. 인증 안내 + "휴대폰 인증하기" (auth §4.2).
  - `FORBIDDEN` — "근로조건은 사장님이나 권한 있는 매니저만 볼 수 있어요."
- 사장님(OWNER) 본인은 근로조건·기기 재등록·퇴사 구역이 없다.
- **역할·권한** 구역 (§4.2 PATCH): 응답 `canEditRole`이 참일 때만 — 사장님이 재직 중인 직원·매니저를 볼 때. 사장님 본인·퇴사한 직원·매니저가 볼 때는 없다.
  - 역할 직원 / 매니저 중 하나. 아래에 한 줄 설명 (직원 "출퇴근하고 본인 근무 기록과 임금명세서를 봐요.", 매니저 "직원 출퇴근 기록을 고치고 새 직원을 등록해요.").
  - 매니저를 고르면 맡길 일 체크박스: "급여 보기"(`PAYROLL_READ`, "정산·임금명세서와 직원 시급을 봐요. 처음 볼 때 휴대폰 인증을 해요."), "근로조건 등록"(`TERMS_EDIT`, "직원 시급과 근무 일정을 등록하고 고쳐요."). 아무것도 안 맡겨도 된다.
  - 직원을 고르면 체크박스가 사라지고 `permissions: []`로 보낸다 (서버도 비운다).
  - "저장"은 바뀐 게 있을 때만 누를 수 있다. 성공하면 토스트 "역할·권한을 바꿨어요" + 상세·변경 이력을 다시 부른다. 실패 문구는 구역 안에.

### 5.3 직원 등록 시트

목록 하단 "직원 등록" → 시트에 QR(10분) + 남은 시간 + "새 QR 만들기"(만료 시) + "링크로 보내기"(7일, 공유 시트 또는 복사).

## 6. API

| Method | Endpoint | 권한 |
| --- | --- | --- |
| POST | `/stores/:storeId/invitations` | Owner, Manager |
| GET | `/stores/:storeId/invitations?status=pending` | Owner, Manager |
| DELETE | `/stores/:storeId/invitations/:id` | Owner, Manager(본인이 만든 것) |
| GET | `/invitations/:token` | 공개 — §3.2 |
| POST | `/invitations/:token/accept` | 공개 — §3.3 |
| GET | `/stores/:storeId/members?status=ACTIVE` | Owner, Manager |
| GET | `/stores/:storeId/members/:memberId` | Owner, Manager |
| PATCH | `/stores/:storeId/members/:memberId` | Owner |
| GET | `/stores/:storeId/members/:memberId/events` | Owner — §4.3 |

## 7. 에러 코드

| code | HTTP | 메시지 |
| --- | --- | --- |
| `INVITATION_INVALID` | 404 | 초대 링크를 찾을 수 없어요. |
| `INVITATION_EXPIRED` | 410 | 초대 링크가 만료됐어요. 사장님께 새 링크를 요청해 주세요. |
| `INVITATION_USED` | 409 | 이미 사용한 초대 링크예요. |
| `ALREADY_MEMBER` | 409 | 이미 이 매장 직원이에요. |
| `CANNOT_DEACTIVATE_OWNER` | 409 | 사장님 계정은 비활성화할 수 없어요. |
| `MEMBER_HAS_OPEN_ATTENDANCE` | 409 | 근무 중인 직원이에요. 퇴근 처리 후 비활성화해 주세요. |

## 8. 수용 기준

- [ ] 같은 초대 링크를 두 기기에서 동시에 수락해도 Membership은 1개.
- [ ] 퇴사한 직원에게 기기 재등록 링크를 보내 수락하면 ACTIVE가 되고 이전 근태 기록이 이어서 보인다.
- [ ] 기기 재등록을 수락하면 그 직원의 이전 기기로는 출퇴근할 수 없다 (`UNAUTHENTICATED`).
- [ ] 이미 다른 매장에 등록된 기기로 새 매장 초대를 수락하면 이름을 다시 묻지 않고 같은 사람으로 연결된다.
- [ ] Manager가 `MANAGER` 역할 초대를 만들면 `FORBIDDEN`.
- [ ] 비활성 직원은 해당 월 출근 기록이 없으면 과금 인원에서 빠진다.
- [ ] 근무 중 직원 비활성화는 막힌다.
- [ ] 역할·권한 변경, 퇴사 처리, 복귀마다 변경 이력이 남고 사장님만 직원 상세에서 본다.
