import { Prisma, type PrismaClient } from '@chulgeunkok/db';

import { requireMembership } from '@/server/auth/require-membership';
import { generateToken } from '@/server/crypto/generate-token';
import { hashToken } from '@/server/crypto/hash-token';
import { ApiError } from '@/server/http/api-error';
import { isValidBusinessNumber, normalizeBusinessNumber } from '@/server/integrations/business-number';
import { lookupBusinessStatus } from '@/server/integrations/nts-business-status';
import { toStoreLocalDate } from '@/shared/lib/format-time';

import type { BusinessVerificationDto, CreateStoreResultDto } from '../model/place-types';
import type { CreateStoreInput } from '../schema';

/** docs/specs/store §3.5 */
export const MAX_OWNED_STORES = 10;
/** 파일럿 무료 기간 (PRD §10) */
const PILOT_TRIAL_MS = 30 * 24 * 60 * 60 * 1000;

type BusinessLookup = typeof lookupBusinessStatus;

/** POST /business-registrations/verify — 체크섬이 틀리면 외부 호출 없이 실패 (docs/specs/store §3.2) */
export async function verifyBusinessNumber(
  input: string,
  lookup: BusinessLookup = lookupBusinessStatus,
): Promise<BusinessVerificationDto> {
  const digits = normalizeBusinessNumber(input);
  if (!digits || !isValidBusinessNumber(digits)) throw new ApiError('BUSINESS_NUMBER_INVALID');
  return lookup(digits);
}

/** POST /stores — docs/specs/store §3.3·§3.4 */
export async function createStore(
  db: PrismaClient,
  input: {
    ownerUserId: string;
    body: CreateStoreInput;
    origin: string;
    now: Date;
    lookup?: BusinessLookup;
  },
): Promise<CreateStoreResultDto> {
  await assertCanCreateStore(db, input.ownerUserId);
  const businessNumber = await resolveActiveBusinessNumber(input.body.businessNumber, input.lookup);
  if (input.body.place) await assertPlaceAvailable(db, input.body.place.placeId);

  try {
    return await db.$transaction(async (tx) => {
      const store = await tx.store.create({
        data: {
          name: input.body.name,
          address: input.body.address,
          latitude: input.body.latitude,
          longitude: input.body.longitude,
          payPeriodStartDay: input.body.payPeriodStartDay,
          businessNumber,
          businessVerifiedAt: businessNumber ? input.now : null,
          placeProvider: input.body.place?.provider ?? null,
          placeId: input.body.place?.placeId ?? null,
        },
      });
      const qrToken = await createStoreRecords(tx, { storeId: store.id, ...input });
      return { store: { id: store.id, name: store.name }, qr: { url: `${input.origin}/p/${qrToken}` } };
    });
  } catch (error) {
    // 확인과 생성 사이에 다른 사장님이 같은 가게를 등록한 경우 (부분 유니크 위반)
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ApiError('STORE_PLACE_TAKEN');
    }
    throw error;
  }
}

/** 사장님 멤버십·매장 QR·사업장 규모 신고·파일럿 구독. 매장 QR 원문을 돌려준다 */
async function createStoreRecords(
  tx: Prisma.TransactionClient,
  input: { storeId: string; ownerUserId: string; body: CreateStoreInput; now: Date },
): Promise<string> {
  const qrToken = generateToken();
  await tx.membership.create({
    data: { storeId: input.storeId, userId: input.ownerUserId, role: 'OWNER' },
  });
  await tx.storeQrToken.create({ data: { storeId: input.storeId, tokenHash: hashToken(qrToken) } });
  await tx.storeHeadcountDeclaration.create({
    data: {
      storeId: input.storeId,
      band: input.body.headcountBand,
      effectiveFrom: new Date(`${toStoreLocalDate(input.now)}T00:00:00Z`),
      declaredById: input.ownerUserId,
    },
  });
  await tx.subscription.create({
    data: {
      storeId: input.storeId,
      plan: 'PILOT',
      status: 'TRIALING',
      periodStart: input.now,
      periodEnd: new Date(input.now.getTime() + PILOT_TRIAL_MS),
    },
  });
  return qrToken;
}

/** 휴대폰 인증한 사람만 매장을 만든다. 직원으로만 등록된 기기(번호 없음)는 막는다 */
async function assertCanCreateStore(db: PrismaClient, userId: string) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user?.phone) {
    throw new ApiError('FORBIDDEN', { message: '휴대폰 인증 후 매장을 만들 수 있어요.' });
  }
  const ownedStores = await db.membership.count({ where: { userId, role: 'OWNER' } });
  if (ownedStores >= MAX_OWNED_STORES) throw new ApiError('STORE_LIMIT_REACHED');
}

/** 클라이언트의 확인 결과는 믿지 않고 서버가 다시 조회한다 */
async function resolveActiveBusinessNumber(
  input: string | undefined,
  lookup?: BusinessLookup,
): Promise<string | null> {
  if (!input?.trim()) return null;
  const verification = await verifyBusinessNumber(input, lookup);
  if (verification.status !== 'ACTIVE') throw new ApiError('BUSINESS_NOT_ACTIVE');
  return verification.businessNumber;
}

async function assertPlaceAvailable(db: PrismaClient, placeId: string) {
  const taken = await db.store.findFirst({
    where: { placeProvider: 'KAKAO', placeId, status: { not: 'CLOSED' } },
  });
  if (taken) throw new ApiError('STORE_PLACE_TAKEN');
}

/** GET /stores/:storeId — 매장 홈 헤더용. 소속 직원 누구나 */
export async function getStoreSummary(
  db: PrismaClient,
  input: { storeId: string; actorUserId: string },
): Promise<{ id: string; name: string; myRole: 'OWNER' | 'MANAGER' | 'EMPLOYEE' }> {
  const actor = await requireMembership({ storeId: input.storeId, userId: input.actorUserId, action: 'MEMBER' }, db);
  const store = await db.store.findUniqueOrThrow({ where: { id: input.storeId } });
  return { id: store.id, name: store.name, myRole: actor.role };
}
