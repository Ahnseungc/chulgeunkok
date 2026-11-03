import { Prisma, type DbClient, type Membership, type PrismaClient } from '@chulgeunkok/db';

import { ApiError } from '@/server/http/api-error';
import {
  findIdempotentReplay,
  hashRequest,
  saveIdempotentResponse,
} from '@/server/http/idempotency';

import { isOutsideStoreArea } from '../model/store-area';
import type {
  AttendanceDto,
  PunchAction,
  PunchPreviewDto,
  PunchResultDto,
} from '../model/punch-types';

import {
  findActiveMembership,
  findEffectiveTerms,
  findOpenAttendance,
  nextPunchAction,
  resolveQrStore,
  toAttendanceDto,
} from './punch-context';

/** 출근 직후 오탭 방지. docs/specs/attendance §3.3 */
export const MIN_CLOCK_OUT_SECONDS = 60;

interface PunchLocation {
  latitude: number;
  longitude: number;
  accuracyM: number;
}

/** GET /attendance/punch-preview — docs/specs/attendance §3.2 */
export async function getPunchPreview(
  db: PrismaClient,
  input: { userId: string; qrToken: string; now: Date },
): Promise<PunchPreviewDto> {
  const store = await resolveQrStore(db, input.qrToken);
  const membership = await findActiveMembership(db, { storeId: store.id, userId: input.userId });
  const openAttendance = await findOpenAttendance(db, membership.id);
  const nextAction = nextPunchAction(openAttendance);
  if (nextAction === 'CLOCK_IN') await requireEffectiveTerms(db, membership, input.now);

  return {
    store: { id: store.id, name: store.name },
    nextAction,
    openAttendance: openAttendance
      ? { id: openAttendance.id, clockInAt: openAttendance.clockInAt.toISOString() }
      : null,
    serverNow: input.now.toISOString(),
  };
}

/**
 * POST /attendance/punch — docs/specs/attendance §3.3
 * 같은 직원의 punch는 Membership 행 잠금으로 직렬화한다.
 *
 * ponytail: 퇴근 후 검토 엔진(docs/specs/labor §5) 호출은 아직 없다. 엔진을 구현할 때
 * 트랜잭션 커밋 뒤에 붙인다. 스펙상 실패해도 일배치가 다시 잡으므로 punch 응답과 분리한다.
 */
export async function punch(
  db: PrismaClient,
  input: {
    userId: string;
    qrToken: string;
    expectedAction: PunchAction;
    location: PunchLocation | null;
    idempotencyKey: string;
    now: Date;
  },
): Promise<PunchResultDto> {
  // 위치는 해시에서 뺀다: 재시도 때 좌표가 조금 달라도 같은 요청
  const scope = {
    userId: input.userId,
    key: input.idempotencyKey,
    requestHash: hashRequest({ qrToken: input.qrToken, expectedAction: input.expectedAction }),
    now: input.now,
  };

  try {
    return await db.$transaction(async (tx) => {
      const store = await resolveQrStore(tx, input.qrToken);
      const membership = await findActiveMembership(tx, { storeId: store.id, userId: input.userId });
      await tx.$queryRaw`SELECT "id" FROM "Membership" WHERE "id" = ${membership.id} FOR UPDATE`;

      const replay = await findIdempotentReplay<PunchResultDto>(tx, scope);
      if (replay) return replay;

      const openAttendance = await findOpenAttendance(tx, membership.id);
      const action = nextPunchAction(openAttendance);
      if (action !== input.expectedAction) throw new ApiError('PUNCH_ACTION_MISMATCH');

      const attendance = openAttendance
        ? await clockOut(tx, { attendance: openAttendance, now: input.now })
        : await clockIn(tx, {
            membership,
            outsideArea: isOutsideStoreArea(store, input.location),
            location: input.location,
            now: input.now,
          });

      const result: PunchResultDto = { action, attendance };
      await saveIdempotentResponse(tx, { ...scope, response: result });
      return result;
    });
  } catch (error) {
    // 같은 키가 다른 매장 QR로 동시에 들어오면 잠금이 달라 유니크 위반으로 끝난다
    if (isUniqueViolation(error)) throw new ApiError('IDEMPOTENCY_KEY_REUSED');
    throw error;
  }
}

/** GET /attendance/current — 재시도 실패 후 기록 여부 확인용 */
export async function getCurrentAttendance(
  db: PrismaClient,
  input: { userId: string; storeId: string },
): Promise<AttendanceDto | null> {
  const membership = await findActiveMembership(db, input);
  const openAttendance = await findOpenAttendance(db, membership.id);
  return openAttendance ? toAttendanceDto(openAttendance) : null;
}

async function requireEffectiveTerms(db: DbClient, membership: Membership, at: Date) {
  const terms = await findEffectiveTerms(db, { membershipId: membership.id, at });
  if (!terms) throw new ApiError('TERMS_NOT_SET');
  return terms;
}

async function clockIn(
  tx: Prisma.TransactionClient,
  input: {
    membership: Membership;
    outsideArea: boolean | null;
    location: PunchLocation | null;
    now: Date;
  },
): Promise<AttendanceDto> {
  const terms = await requireEffectiveTerms(tx, input.membership, input.now);
  const attendance = await tx.attendance.create({
    data: {
      storeId: input.membership.storeId,
      membershipId: input.membership.id,
      termsId: terms.id,
      clockInAt: input.now,
      clockInLatitude: input.location?.latitude ?? null,
      clockInLongitude: input.location?.longitude ?? null,
      clockInAccuracyM: input.location?.accuracyM ?? null,
      clockInOutsideArea: input.outsideArea,
    },
  });
  return toAttendanceDto(attendance);
}

async function clockOut(
  tx: Prisma.TransactionClient,
  input: { attendance: { id: string; clockInAt: Date }; now: Date },
): Promise<AttendanceDto> {
  const elapsedSeconds = (input.now.getTime() - input.attendance.clockInAt.getTime()) / 1000;
  if (elapsedSeconds < MIN_CLOCK_OUT_SECONDS) throw new ApiError('PUNCH_TOO_SOON');
  const attendance = await tx.attendance.update({
    where: { id: input.attendance.id },
    data: { clockOutAt: input.now, status: 'CLOSED' },
  });
  return toAttendanceDto(attendance);
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
