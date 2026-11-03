# 직원 초대·관리 — 기능 스펙

| 항목 | 값 |
| --- | --- |
| 상태 | **Draft** (2026-11-03) |
| PRD | [§2, §3.2, §4 STAFF-01·02](../../prd-v0.4.md) |
| 인덱스 | [../README.md](../README.md) |

---

## 1. 개요

1. 사장님(또는 Manager)이 초대 링크를 만든다. 휴대폰 번호를 넣으면 그 번호의 사용자만 수락할 수 있다.
2. 직원이 링크로 로그인·수락하면 `Membership(EMPLOYEE, ACTIVE)`이 생긴다.
3. 수락 직후 근로조건이 없으면 출근할 수 없다 (`attendance` §3 `TERMS_NOT_SET`). 사장님 화면에 "근로조건 등록 필요"가 뜬다.
4. 퇴사는 비활성화. 기록은 남고 과금에서 빠진다.

## 2. 범위 / 비목표

| 포함 | 제외 |
| --- | --- |
| 링크 초대, 번호 지정 초대 | 문자·알림톡 자동 발송 (P1, MVP는 공유 시트) |
| 초대 취소 | 엑셀 일괄 등록 |
| 비활성화·재활성화 | 직원 영구 삭제 |
| Manager 지정·권한 위임 | 매장 소유권 이전 |

## 3. 초대

### 3.1 생성

```ts
const CreateInvitationBody = z.object({
  role: z.enum(['EMPLOYEE', 'MANAGER']).default('EMPLOYEE'),
  phone: z.string().optional(), // 입력 시 E.164 정규화
});
```

- Manager는 `EMPLOYEE` 초대만 가능.
- 토큰: 32바이트 base64url, 해시 저장, **7일 만료, 1회용**.
- 응답 `{ url: 'https://<도메인>/invite/<token>', expiresAt }`. 화면은 Web Share API(실패 시 링크 복사).

### 3.2 수락 `/invite/[token]`

| 순서 | 조건 | 결과 |
| --- | --- | --- |
| 1 | 토큰 없음·폐기 | `404 INVITATION_INVALID` |
| 2 | 만료 | `410 INVITATION_EXPIRED` |
| 3 | `acceptedAt` 있음 | `409 INVITATION_USED` |
| 4 | 미로그인 | `/login?callbackUrl=/invite/<token>` |
| 5 | 초대에 `phone` 있고 사용자 번호와 다름 | `403 INVITATION_PHONE_MISMATCH` |
| 6 | 이미 ACTIVE Membership | `409 ALREADY_MEMBER` |
| 7 | INACTIVE Membership 있음 | 같은 Membership을 ACTIVE로 되돌림, `leftAt = null`, 역할은 초대값 |
| 8 | 그 외 | Membership 생성 |

- 7·8과 `acceptedAt` 기록은 한 트랜잭션. `acceptedAt IS NULL` 조건부 update로 동시 수락을 막는다.
- 수락 화면: 매장명, 초대한 사람 이름, 역할, "참여하기" 버튼. 토큰만으로 매장명은 보여 준다 (로그인 전).

### 3.3 취소

`revokedAt = now()`. 대기 중 초대 목록은 직원 목록 상단에 노출.

## 4. 직원 상태

```
ACTIVE ──비활성화──▶ INACTIVE ──재초대 수락──▶ ACTIVE
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
| GET | `/invitations/:token` | 공개 — 매장명·초대자·역할·만료만 |
| POST | `/invitations/:token/accept` | 로그인 |
| GET | `/stores/:storeId/members?status=ACTIVE` | Owner, Manager |
| GET | `/stores/:storeId/members/:memberId` | Owner, Manager |
| PATCH | `/stores/:storeId/members/:memberId` | Owner |

## 7. 에러 코드

| code | HTTP | 메시지 |
| --- | --- | --- |
| `INVITATION_INVALID` | 404 | 초대 링크를 찾을 수 없어요. |
| `INVITATION_EXPIRED` | 410 | 초대 링크가 만료됐어요. 사장님께 새 링크를 요청해 주세요. |
| `INVITATION_USED` | 409 | 이미 사용한 초대 링크예요. |
| `INVITATION_PHONE_MISMATCH` | 403 | 초대받은 휴대폰 번호로 로그인해 주세요. |
| `ALREADY_MEMBER` | 409 | 이미 이 매장 직원이에요. |
| `CANNOT_DEACTIVATE_OWNER` | 409 | 사장님 계정은 비활성화할 수 없어요. |
| `MEMBER_HAS_OPEN_ATTENDANCE` | 409 | 근무 중인 직원이에요. 퇴근 처리 후 비활성화해 주세요. |

## 8. 수용 기준

- [ ] 같은 초대 링크를 두 기기에서 동시에 수락해도 Membership은 1개.
- [ ] 퇴사 후 재초대하면 이전 근태 기록이 같은 직원에 이어서 보인다.
- [ ] Manager가 `MANAGER` 역할 초대를 만들면 `FORBIDDEN`.
- [ ] 비활성 직원은 해당 월 출근 기록이 없으면 과금 인원에서 빠진다.
- [ ] 근무 중 직원 비활성화는 막힌다.
