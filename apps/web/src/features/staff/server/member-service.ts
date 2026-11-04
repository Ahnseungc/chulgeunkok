import type { Membership, PrismaClient, User } from '@chulgeunkok/db';

import { toTermsDto } from '@/features/labor/server/labor-context';
import { OPEN_REVIEW_STATUSES } from '@/features/labor/server/review-service';
import { canAccessStore } from '@/server/auth/access';
import { requireMembership } from '@/server/auth/require-membership';
import { ApiError } from '@/server/http/api-error';

import type { MemberDetailDto, MemberSummaryDto } from '../model/member-types';
import type { UpdateMemberInput } from '../schema';

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

  const canReadTerms = canAccessStore(actor, 'TERMS_READ');
  const latestTerms = member.employmentTerms[0];
  return {
    ...toSummary(member),
    permissions: member.permissions,
    isWorking: member.attendances.length > 0,
    hasTerms: latestTerms?.effectiveTo === null,
    openReviewCount: member.laborReviews.length,
    currentTerms: canReadTerms && latestTerms ? toTermsDto(latestTerms) : null,
    canReadTerms,
    canEditTerms: canAccessStore(actor, 'TERMS_WRITE') && member.status === 'ACTIVE',
  };
}

/** PATCH /stores/:storeId/members/:memberId — 역할·권한 변경, 비활성화 (docs/specs/staff §4) */
export async function updateMember(
  db: PrismaClient,
  input: { storeId: string; actorUserId: string; memberId: string; change: UpdateMemberInput; now: Date },
): Promise<MemberDetailDto> {
  await requireMembership({ storeId: input.storeId, userId: input.actorUserId, action: 'MEMBER_ADMIN' }, db);
  const member = await db.membership.findFirst({ where: { id: input.memberId, storeId: input.storeId } });
  if (!member) throw new ApiError('NOT_FOUND');
  if (member.role === 'OWNER') throw new ApiError('CANNOT_DEACTIVATE_OWNER');

  if (input.change.status === 'INACTIVE') {
    await deactivateMember(db, { member, now: input.now });
  } else {
    const role = input.change.role ?? member.role;
    await db.membership.update({
      where: { id: member.id },
      // 위임 권한은 Manager에게만 의미가 있다. 직원으로 내리면 비운다
      data: { role, permissions: role === 'MANAGER' ? (input.change.permissions ?? member.permissions) : [] },
    });
  }
  return getMember(db, input);
}

/** 근무 중이면 막는다. 열린 근로조건은 지금 닫는다. leftAt은 기록 보관 3년의 시작점 */
async function deactivateMember(db: PrismaClient, input: { member: Membership; now: Date }) {
  await db.$transaction(async (tx) => {
    const working = await tx.attendance.findFirst({ where: { membershipId: input.member.id, status: 'OPEN' } });
    if (working) throw new ApiError('MEMBER_HAS_OPEN_ATTENDANCE');
    await tx.membership.update({
      where: { id: input.member.id },
      data: { status: 'INACTIVE', leftAt: input.now },
    });
    await tx.employmentTerms.updateMany({
      where: { membershipId: input.member.id, effectiveTo: null, effectiveFrom: { lt: input.now } },
      data: { effectiveTo: input.now },
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
