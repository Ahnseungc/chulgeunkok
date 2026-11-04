import type { HeadcountBand, PrismaClient, Store } from '@chulgeunkok/db';

import { getStorePayPeriod, payPeriodConfigOf, toLocalDate } from '@/features/payroll/model/work-time';
import { requireMembership } from '@/server/auth/require-membership';
import { generateToken } from '@/server/crypto/generate-token';
import { hashToken } from '@/server/crypto/hash-token';
import { ApiError } from '@/server/http/api-error';

import type { StoreSettingsDto } from '../model/store-settings-types';

/** 사업장 규모 신고는 오늘부터 이 기간 안의 날짜만 (docs/specs/store §6.1) */
const HEADCOUNT_BACKDATE_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

const dateColumn = (localDate: string) => new Date(`${localDate}T00:00:00Z`);
const addDays = (localDate: string, days: number) =>
  new Date(Date.parse(`${localDate}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

/** GET /stores/:storeId/settings — 사장님 */
export async function getStoreSettings(
  db: PrismaClient,
  input: { storeId: string; actorUserId: string; now: Date },
): Promise<StoreSettingsDto> {
  await requireMembership({ storeId: input.storeId, userId: input.actorUserId, action: 'STORE_ADMIN' }, db);
  const [store, declarations, activeQr] = await Promise.all([
    db.store.findUniqueOrThrow({ where: { id: input.storeId } }),
    db.storeHeadcountDeclaration.findMany({
      where: { storeId: input.storeId },
      include: { declaredBy: true },
      orderBy: { effectiveFrom: 'desc' },
    }),
    db.storeQrToken.findFirst({ where: { storeId: input.storeId, revokedAt: null } }),
  ]);
  const today = toLocalDate(input.now);
  const config = payPeriodConfigOf(store);
  const pending = config.changeEffectiveFrom && config.changeEffectiveFrom > today ? config.changeEffectiveFrom : null;
  return {
    id: store.id,
    name: store.name,
    address: store.address,
    payPeriod: {
      // 변경이 대기 중이면 지금 적용 중인 값은 이전 시작일이다
      currentStartDay: pending ? (config.previousStartDay ?? config.startDay) : config.startDay,
      pendingChange: pending ? { startDay: config.startDay, effectiveFrom: pending } : null,
      currentPeriod: getStorePayPeriod(today, config),
    },
    headcount: {
      current: declarations.find((declaration) => toLocalDate(declaration.effectiveFrom) <= today)?.band ?? 'UNKNOWN',
      history: declarations.map((declaration) => ({
        band: declaration.band,
        effectiveFrom: declaration.effectiveFrom.toISOString().slice(0, 10),
        declaredByName: declaration.declaredBy.name,
        note: declaration.note,
      })),
    },
    qrIssuedAt: activeQr?.createdAt.toISOString() ?? null,
  };
}

/** PATCH /stores/:storeId — 이름·주소·정산 시작일 (docs/specs/store §4) */
export async function updateStore(
  db: PrismaClient,
  input: {
    storeId: string;
    actorUserId: string;
    body: { name?: string; address?: string; latitude?: number; longitude?: number; payPeriodStartDay?: number };
    now: Date;
  },
): Promise<StoreSettingsDto> {
  await requireMembership({ storeId: input.storeId, userId: input.actorUserId, action: 'STORE_ADMIN' }, db);
  const store = await db.store.findUniqueOrThrow({ where: { id: input.storeId } });
  const { payPeriodStartDay, ...profile } = input.body;
  await db.store.update({
    where: { id: store.id },
    data: {
      ...profile,
      ...(payPeriodStartDay === undefined ? {} : planPayPeriodChange(store, { startDay: payPeriodStartDay, now: input.now })),
    },
  });
  return getStoreSettings(db, input);
}

/**
 * 정산 시작일은 지금 기간을 그대로 두고 다음 기간부터 바꾼다.
 * - 대기 중인 변경이 있으면 그 변경의 값만 바꾼다 (원래 값으로 되돌리면 변경 취소)
 * ponytail: 변경 이력은 1단계만 보관한다. 두 번 바뀐 뒤 아주 오래된 기간을 다시 보면 계산이 달라질 수 있다.
 * 업그레이드: 시작일 이력 테이블(StorePayPeriodRule)로 옮긴다.
 */
function planPayPeriodChange(store: Store, input: { startDay: number; now: Date }) {
  const today = toLocalDate(input.now);
  const config = payPeriodConfigOf(store);
  const pending = config.changeEffectiveFrom && config.changeEffectiveFrom > today;
  if (pending) {
    if (input.startDay === config.previousStartDay) {
      return { payPeriodStartDay: input.startDay, previousPayPeriodStartDay: null, payPeriodStartDayEffectiveFrom: null };
    }
    return { payPeriodStartDay: input.startDay };
  }
  if (input.startDay === config.startDay) return {};
  const currentPeriod = getStorePayPeriod(today, config);
  return {
    payPeriodStartDay: input.startDay,
    previousPayPeriodStartDay: config.startDay,
    payPeriodStartDayEffectiveFrom: dateColumn(currentPeriod.end),
  };
}

/** POST /stores/:storeId/qr/rotate — 지금 QR을 바로 폐기하고 새 QR (docs/specs/store §5.2) */
export async function rotateStoreQr(
  db: PrismaClient,
  input: { storeId: string; actorUserId: string; origin: string; now: Date },
): Promise<{ url: string }> {
  await requireMembership({ storeId: input.storeId, userId: input.actorUserId, action: 'STORE_ADMIN' }, db);
  const token = generateToken();
  await db.$transaction([
    db.storeQrToken.updateMany({ where: { storeId: input.storeId, revokedAt: null }, data: { revokedAt: input.now } }),
    db.storeQrToken.create({ data: { storeId: input.storeId, tokenHash: hashToken(token) } }),
  ]);
  return { url: `${input.origin}/p/${token}` };
}

/** POST /stores/:storeId/headcount-declarations — 같은 날짜는 덮어쓴다 (docs/specs/store §6.1) */
export async function declareHeadcount(
  db: PrismaClient,
  input: {
    storeId: string;
    actorUserId: string;
    body: { band: HeadcountBand; effectiveFrom: string; note?: string };
    now: Date;
  },
): Promise<StoreSettingsDto> {
  await requireMembership({ storeId: input.storeId, userId: input.actorUserId, action: 'STORE_ADMIN' }, db);
  const today = toLocalDate(input.now);
  if (input.body.effectiveFrom > today || input.body.effectiveFrom < addDays(today, -HEADCOUNT_BACKDATE_DAYS)) {
    throw new ApiError('HEADCOUNT_DATE_OUT_OF_RANGE');
  }
  const effectiveFrom = dateColumn(input.body.effectiveFrom);
  await db.storeHeadcountDeclaration.upsert({
    where: { storeId_effectiveFrom: { storeId: input.storeId, effectiveFrom } },
    create: {
      storeId: input.storeId,
      band: input.body.band,
      effectiveFrom,
      declaredById: input.actorUserId,
      note: input.body.note,
    },
    update: { band: input.body.band, declaredById: input.actorUserId, note: input.body.note },
  });
  return getStoreSettings(db, input);
}
