import type { DbClient, Membership, MembershipEventType, Prisma, PrismaClient } from '@chulgeunkok/db';

import { requireMembership } from '@/server/auth/require-membership';
import { ApiError } from '@/server/http/api-error';

import type { MembershipEventDto } from '../model/member-types';

/** 이력에 남기는 Membership 값. docs/specs/staff §4.3 */
export type MembershipState = Pick<Membership, 'role' | 'permissions' | 'status'>;

const samePermissions = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && [...a].sort().join() === [...b].sort().join();

/** 바뀐 값마다 이벤트 1개. before·after에는 그 종류의 값만 담는다 */
function diffEvents(before: MembershipState, after: MembershipState) {
  const events: { type: MembershipEventType; before: Prisma.InputJsonObject; after: Prisma.InputJsonObject }[] = [];
  if (before.status !== after.status) {
    const type = after.status === 'INACTIVE' ? 'DEACTIVATED' : 'REACTIVATED';
    events.push({ type, before: { status: before.status }, after: { status: after.status } });
  }
  if (before.role !== after.role) {
    events.push({ type: 'ROLE_CHANGED', before: { role: before.role }, after: { role: after.role } });
  }
  if (!samePermissions(before.permissions, after.permissions)) {
    events.push({
      type: 'PERMISSIONS_CHANGED',
      before: { permissions: [...before.permissions] },
      after: { permissions: [...after.permissions] },
    });
  }
  return events;
}

/**
 * 역할·권한·상태 변경을 이력으로 남긴다 (docs/specs/README.md §2.6). 변경과 같은 트랜잭션 클라이언트로 부른다.
 * 바뀐 값이 없으면 아무것도 쓰지 않는다.
 */
export async function recordMembershipChange(
  tx: DbClient,
  input: { membershipId: string; actorId: string; before: MembershipState; after: MembershipState; now: Date },
): Promise<void> {
  const events = diffEvents(input.before, input.after);
  if (events.length === 0) return;
  await tx.membershipEvent.createMany({
    data: events.map((event) => ({
      ...event,
      membershipId: input.membershipId,
      actorId: input.actorId,
      createdAt: input.now,
    })),
  });
}

/** GET /stores/:storeId/members/:memberId/events — 사장님만, 최근 것 먼저 (docs/specs/staff §4.3) */
export async function listMembershipEvents(
  db: PrismaClient,
  input: { storeId: string; actorUserId: string; memberId: string },
): Promise<MembershipEventDto[]> {
  await requireMembership({ storeId: input.storeId, userId: input.actorUserId, action: 'MEMBER_ADMIN' }, db);
  const member = await db.membership.findFirst({ where: { id: input.memberId, storeId: input.storeId }, select: { id: true } });
  if (!member) throw new ApiError('NOT_FOUND');
  const events = await db.membershipEvent.findMany({
    where: { membershipId: member.id },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    include: { actor: { select: { name: true } } },
  });
  return events.map((event) => ({
    id: event.id,
    type: event.type,
    before: event.before as MembershipEventDto['before'],
    after: event.after as MembershipEventDto['after'],
    actorName: event.actor.name,
    createdAt: event.createdAt.toISOString(),
  }));
}
