import type { DbClient, Membership, Prisma, PrismaClient } from '@chulgeunkok/db';

import { registerDevice, revokeUserDevices } from '@/features/auth/server/device';
import { requireMembership } from '@/server/auth/require-membership';
import { generateToken } from '@/server/crypto/generate-token';
import { hashToken } from '@/server/crypto/hash-token';
import { ApiError } from '@/server/http/api-error';

import type {
  AcceptInvitationResultDto,
  CreateInvitationResultDto,
  InvitationInfoDto,
} from '../model/invitation-types';
import type { CreateInvitationInput } from '../schema';

/** 초대 유효 기간. 얼굴 보고 찍는 QR은 짧게, 메신저 링크는 길게. docs/specs/staff §3.1 */
export const INVITATION_TTL_MS = {
  QR: 10 * 60 * 1000,
  LINK: 7 * 24 * 60 * 60 * 1000,
} as const satisfies Record<CreateInvitationInput['delivery'], number>;

/** POST /stores/:storeId/invitations — docs/specs/staff §3.1 */
export async function createInvitation(
  db: PrismaClient,
  input: {
    storeId: string;
    actorUserId: string;
    body: CreateInvitationInput;
    origin: string;
    now: Date;
  },
): Promise<CreateInvitationResultDto> {
  const actor = await requireMembership(
    { storeId: input.storeId, userId: input.actorUserId, action: 'INVITE' },
    db,
  );
  const target = await resolveInvitationTarget(db, { actor, body: input.body });
  const token = generateToken();
  const expiresAt = new Date(input.now.getTime() + INVITATION_TTL_MS[input.body.delivery]);

  await db.storeInvitation.create({
    data: {
      storeId: input.storeId,
      tokenHash: hashToken(token),
      kind: input.body.kind,
      role: target.role,
      memberId: target.memberId,
      createdById: input.actorUserId,
      expiresAt,
    },
  });
  return { url: `${input.origin}/invite/${token}`, expiresAt: expiresAt.toISOString() };
}

/** Manager는 직원(EMPLOYEE)만 초대·재등록할 수 있다. 사장님 기기는 초대로 바꾸지 않는다 */
async function resolveInvitationTarget(
  db: DbClient,
  input: { actor: Membership; body: CreateInvitationInput },
): Promise<{ role: Membership['role']; memberId: string | null }> {
  const actorIsManager = input.actor.role === 'MANAGER';
  if (input.body.kind === 'JOIN') {
    if (actorIsManager && input.body.role !== 'EMPLOYEE') throw new ApiError('FORBIDDEN');
    return { role: input.body.role, memberId: null };
  }
  const member = await db.membership.findFirst({
    where: { id: input.body.memberId, storeId: input.actor.storeId },
  });
  if (!member) throw new ApiError('NOT_FOUND');
  if (member.role === 'OWNER') throw new ApiError('FORBIDDEN');
  if (actorIsManager && member.role !== 'EMPLOYEE') throw new ApiError('FORBIDDEN');
  return { role: member.role, memberId: member.id };
}

/** GET /invitations/:token (공개) — docs/specs/staff §3.2 */
export async function getInvitationInfo(
  db: PrismaClient,
  input: { token: string; sessionUserId: string | null; now: Date },
): Promise<InvitationInfoDto> {
  const invitation = await loadUsableInvitation(db, input);
  return {
    kind: invitation.kind,
    storeName: invitation.store.name,
    inviterName: invitation.createdBy.name,
    role: invitation.role,
    memberName: invitation.member?.user.name ?? null,
    needsName: invitation.kind === 'JOIN' && !input.sessionUserId,
    expiresAt: invitation.expiresAt.toISOString(),
  };
}

/**
 * POST /invitations/:token/accept (공개) — docs/specs/staff §3.3
 * 새 기기를 등록했으면 `deviceToken`을 돌려준다. 호출부가 HttpOnly 쿠키로 심는다.
 */
export async function acceptInvitation(
  db: PrismaClient,
  input: {
    token: string;
    sessionUserId: string | null;
    name: string | undefined;
    userAgent: string | null;
    now: Date;
  },
): Promise<AcceptInvitationResultDto & { deviceToken: string | null }> {
  return db.$transaction(async (tx) => {
    const invitation = await loadUsableInvitation(tx, input);
    // 동시 수락 방지: acceptedAt이 비어 있을 때만 선점. 이후 실패하면 트랜잭션째 롤백된다
    const claimed = await tx.storeInvitation.updateMany({
      where: { id: invitation.id, acceptedAt: null },
      data: { acceptedAt: input.now },
    });
    if (claimed.count === 0) throw new ApiError('INVITATION_USED');

    const accepted = invitation.member
      ? await acceptReregister(tx, { member: invitation.member, ...input })
      : await acceptJoin(tx, { storeId: invitation.storeId, role: invitation.role, ...input });

    await tx.storeInvitation.update({
      where: { id: invitation.id },
      data: { acceptedById: accepted.userId },
    });
    return {
      storeId: invitation.storeId,
      storeName: invitation.store.name,
      role: accepted.role,
      deviceToken: accepted.deviceToken,
    };
  });
}

interface AcceptedMember {
  userId: string;
  role: Membership['role'];
  deviceToken: string | null;
}

/** 기존 직원의 기기를 이 기기 하나로 바꾸고, 퇴사 상태면 복귀시킨다 */
async function acceptReregister(
  tx: Prisma.TransactionClient,
  input: { member: Membership; userAgent: string | null; now: Date },
): Promise<AcceptedMember> {
  const { member } = input;
  await revokeUserDevices(tx, { userId: member.userId, now: input.now });
  const deviceToken = await registerDevice(tx, {
    userId: member.userId,
    userAgent: input.userAgent,
  });
  if (member.status === 'INACTIVE') {
    await tx.membership.update({
      where: { id: member.id },
      data: { status: 'ACTIVE', leftAt: null },
    });
  }
  return { userId: member.userId, role: member.role, deviceToken };
}

/** 새 직원: 등록된 기기면 그 사람으로, 아니면 이름으로 사람과 기기를 만든다 */
async function acceptJoin(
  tx: Prisma.TransactionClient,
  input: {
    storeId: string;
    role: Membership['role'];
    sessionUserId: string | null;
    name: string | undefined;
    userAgent: string | null;
  },
): Promise<AcceptedMember> {
  const { userId, deviceToken } = await resolveJoiningUser(tx, input);
  const existing = await tx.membership.findUnique({
    where: { storeId_userId: { storeId: input.storeId, userId } },
  });
  if (existing?.status === 'ACTIVE') throw new ApiError('ALREADY_MEMBER');
  if (existing) {
    await tx.membership.update({
      where: { id: existing.id },
      data: { status: 'ACTIVE', role: input.role, leftAt: null },
    });
  } else {
    await tx.membership.create({ data: { storeId: input.storeId, userId, role: input.role } });
  }
  return { userId, role: input.role, deviceToken };
}

async function resolveJoiningUser(
  tx: Prisma.TransactionClient,
  input: { sessionUserId: string | null; name: string | undefined; userAgent: string | null },
): Promise<{ userId: string; deviceToken: string | null }> {
  if (input.sessionUserId) return { userId: input.sessionUserId, deviceToken: null };
  if (!input.name) {
    throw new ApiError('VALIDATION_FAILED', { message: '이름을 입력해 주세요.' });
  }
  const user = await tx.user.create({ data: { name: input.name } });
  const deviceToken = await registerDevice(tx, { userId: user.id, userAgent: input.userAgent });
  return { userId: user.id, deviceToken };
}

/** 토큰 → 쓸 수 있는 초대. 없음·폐기 INVALID, 만료 EXPIRED, 수락됨 USED */
async function loadUsableInvitation(db: DbClient, input: { token: string; now: Date }) {
  const invitation = await db.storeInvitation.findUnique({
    where: { tokenHash: hashToken(input.token) },
    include: { store: true, createdBy: true, member: { include: { user: true } } },
  });
  if (!invitation || invitation.revokedAt) throw new ApiError('INVITATION_INVALID');
  if (invitation.expiresAt <= input.now) throw new ApiError('INVITATION_EXPIRED');
  if (invitation.acceptedAt) throw new ApiError('INVITATION_USED');
  return invitation;
}
