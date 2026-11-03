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
| 4 | `REREGISTER` | 대상 직원의 기존 기기 전부 폐기 → 이 기기 등록. 대상이 INACTIVE면 ACTIVE로 되돌림(`leftAt = null`) |
| 5 | `JOIN`, 이 기기가 이미 등록됨 | 그 User로 진행 (한 사람이 여러 매장에서 일하는 경우) |
| 6 | `JOIN`, 미등록 기기 | `name`으로 User 생성 + 기기 등록 |
| 7 | 5·6에서 이미 이 매장 ACTIVE 직원 | `409 ALREADY_MEMBER` |
| 8 | 5에서 이 매장 INACTIVE 직원 | 같은 Membership을 ACTIVE로 되돌림, 역할은 초대값 |
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
- 처리: `status = INACTIVE`, `leftAt = now()`, 현재 근로조건 `effectiveTo = now()`.
- `leftAt`은 기록 보관 3년의 시작점이다 (PRD §9).

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

## 5. 직원 목록·상세

### 5.1 목록 `/owner/[storeId]/members`

| 열 | 비고 |
| --- | --- |
| 이름, 역할 | |
| 상태 배지 | 근무 중 / 근로조건 필요 / 검토 필요 n건 / 비활성 |
| 이번 정산기간 근무시간 | |

필터: 활성(기본) / 비활성. 정렬: 근무 중 → 이름순.

### 5.2 상세 `/owner/[storeId]/members/[memberId]`

탭: **근로조건** (`labor`) · **근태 기록** (`attendance`) · **검토** (`labor` §6).

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
