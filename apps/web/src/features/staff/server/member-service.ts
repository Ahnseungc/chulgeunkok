import type { Membership, PrismaClient, User } from '@chulgeunkok/db';

import { toTermsDto } from '@/features/labor/server/labor-context';
import { OPEN_REVIEW_STATUSES } from '@/features/labor/server/review-service';
import { canAccessStore } from '@/server/auth/access';
import { canAccessVerified, requireMembership } from '@/server/auth/require-membership';
import { ApiError } from '@/server/http/api-error';

import type { MemberDetailDto, MemberSummaryDto, TermsAccess } from '../model/member-types';
import type { UpdateMemberInput } from '../schema';

import { recordMembershipChange } from './membership-events';

/** 목록 정렬: 근무 중 → 사장님·매니저 → 이름 */
const ROLE_ORDER = { OWNER: 0, MANAGER: 1, EMPLOYEE: 2 } as const;

/** GET /stores/:storeId/members — docs/specs/staff §5.1 */
export async function listMembers(
  db: PrismaClient,
  input: { storeId: string; actorUserId: string; status: 'ACTIVE' | 'INACTIVE' },
): Promise<MemberSummaryDto[]> {
  await requireMembership({ storeId: input.storeId, userId: input.actorUserId, action: 'ATTENDANCE_ADMIN' }, db);
  const members = await db.membership.findMany({
    where: { storeId: input.storeId, status: input.status },
    include: {
      user: true,
      attendances: { where: { status: 'OPEN' }, select: { id: true } },
      employmentTerms: { where: { effectiveTo: null }, select: { id: true } },
      laborReviews: { where: { status: { in: [...OPEN_REVIEW_STATUSES] } }, select: { id: true } },
    },
  });
  return members
    .map((member) => ({
      ...toSummary(member),
      isWorking: member.attendances.length > 0,
      hasTerms: member.employmentTerms.length > 0,
      openReviewCount: member.laborReviews.length,
    }))
    .sort(
      (a, b) =>
        Number(b.isWorking) - Number(a.isWorking) ||
        ROLE_ORDER[a.role] - ROLE_ORDER[b.role] ||
        a.name.localeCompare(b.name, 'ko'),
    );
}

/** GET /stores/:storeId/members/:memberId — docs/specs/staff §5.2 */
export async function getMember(
  db: PrismaClient,
  input: { storeId: string; actorUserId: string; memberId: string },
): Promise<MemberDetailDto> {
  const actor = await requireMembership({ storeId: input.storeId, userId: input.actorUserId, action: 'ATTENDANCE_ADMIN' }, db);
  const member = await db.membership.findFirst({
    where: { id: input.memberId, storeId: input.storeId },
    include: {
      user: true,
      attendances: { where: { status: 'OPEN' }, select: { id: true } },
      employmentTerms: { orderBy: { version: 'desc' }, take: 1, include: { schedules: true } },
      laborReviews: { where: { status: { in: [...OPEN_REVIEW_STATUSES] } }, select: { id: true } },
    },
  });
  if (!member) throw new ApiError('NOT_FOUND');

  const termsAccess = await termsAccessOf(db, actor, member.id);
  const latestTerms = member.employmentTerms[0];
  return {
    ...toSummary(member),
    permissions: member.permissions,
    isWorking: member.attendances.length > 0,
    hasTerms: latestTerms?.effectiveTo === null,
    openReviewCount: member.laborReviews.length,
    currentTerms: termsAccess === 'ALLOWED' && latestTerms ? toTermsDto(latestTerms) : null,
    termsAccess,
    canEditTerms: canAccessStore(actor, 'TERMS_WRITE') && member.status === 'ACTIVE',
    canViewHistory: canAccessStore(actor, 'MEMBER_ADMIN'),
  };
}

/**
 * 시급이 보이므로 PAYROLL_READ로만 들어온 Manager는 휴대폰 인증 뒤에만 (auth §4.2). 본인 근로조건은 인증 없이도 본다.
 * 검토 안내(LABOR_REVIEW)도 같은 규칙이라 화면은 이 값 하나로 두 구역을 가른다.
 */
async function termsAccessOf(db: PrismaClient, actor: Membership, memberId: string): Promise<TermsAccess> {
  if (memberId === actor.id) return 'ALLOWED';
  if (!canAccessStore(actor, 'TERMS_READ')) return 'FORBIDDEN';
  return (await canAccessVerified(db, actor, 'TERMS_READ')) ? 'ALLOWED' : 'PHONE_VERIFICATION_REQUIRED';
}

/** PATCH /stores/:storeId/members/:memberId — 역할·권한 변경, 비활성화 (docs/specs/staff §4). 바뀐 값은 이력에 남긴다 (§4.3) */
export async function updateMember(
  db: PrismaClient,
  input: { storeId: string; actorUserId: string; memberId: string; change: UpdateMemberInput; now: Date },
): Promise<MemberDetailDto> {
  await requireMembership({ storeId: input.storeId, userId: input.actorUserId, action: 'MEMBER_ADMIN' }, db);
  const member = await db.membership.findFirst({ where: { id: input.memberId, storeId: input.storeId } });
  if (!member) throw new ApiError('NOT_FOUND');
  if (member.role === 'OWNER') throw new ApiError('CANNOT_DEACTIVATE_OWNER');

  const change = { member, actorId: input.actorUserId, now: input.now };
  if (input.change.status === 'INACTIVE') await deactivateMember(db, change);
  else await changeRole(db, { ...change, role: input.change.role, permissions: input.change.permissions });
  return getMember(db, input);
}

interface MemberChange {
  member: Membership;
  actorId: string;
  now: Date;
}

/** 위임 권한은 Manager에게만 의미가 있다. 직원으로 내리면 비운다. 이력 before는 트랜잭션 안에서 다시 읽은 값 */
async function changeRole(
  db: PrismaClient,
  input: MemberChange & Pick<UpdateMemberInput, 'role' | 'permissions'>,
) {
  await db.$transaction(async (tx) => {
    const current = await tx.membership.findUniqueOrThrow({ where: { id: input.member.id } });
    const role = input.role ?? current.role;
    const permissions = role === 'MANAGER' ? (input.permissions ?? current.permissions) : [];
    await tx.membership.update({ where: { id: current.id }, data: { role, permissions } });
    await recordMembershipChange(tx, {
      membershipId: current.id,
      actorId: input.actorId,
      before: current,
      after: { role, permissions, status: current.status },
      now: input.now,
    });
  });
}

/**
 * 근무 중이면 막는다. 열린 근로조건은 지금 닫는다. leftAt은 기록 보관 3년의 시작점.
 * 위임 권한도 비운다 — 새 직원 초대로 복귀할 때 예전 급여 권한이 조용히 되살아나지 않게 (staff §4.1)
 */
async function deactivateMember(db: PrismaClient, input: MemberChange) {
  await db.$transaction(async (tx) => {
    const current = await tx.membership.findUniqueOrThrow({ where: { id: input.member.id } });
    const working = await tx.attendance.findFirst({ where: { membershipId: current.id, status: 'OPEN' } });
    if (working) throw new ApiError('MEMBER_HAS_OPEN_ATTENDANCE');
    await tx.membership.update({
      where: { id: current.id },
      data: { status: 'INACTIVE', leftAt: input.now, permissions: [] },
    });
    await tx.employmentTerms.updateMany({
      where: { membershipId: current.id, effectiveTo: null, effectiveFrom: { lt: input.now } },
      data: { effectiveTo: input.now },
    });
    await recordMembershipChange(tx, {
      membershipId: current.id,
      actorId: input.actorId,
      before: current,
      after: { ...current, status: 'INACTIVE', permissions: [] },
      now: input.now,
    });
  });
}

function toSummary(member: Membership & { user: User }): Omit<MemberSummaryDto, 'isWorking' | 'hasTerms' | 'openReviewCount'> {
  return {
    memberId: member.id,
    name: member.user.name,
    role: member.role,
    status: member.status,
    joinedAt: member.joinedAt.toISOString(),
    leftAt: member.leftAt?.toISOString() ?? null,
  };
}
