/**
 * 푸시 토큰 등록. 정본: docs/specs/payslip §6·§7
 * 기기(DeviceCredential)당 토큰 1개. 같은 토큰이 다른 기기에 남아 있으면 그 행을 지운다.
 */

import type { DbClient } from '@chulgeunkok/db';

import { findDeviceCredential } from '@/features/auth/server/device';
import { ApiError } from '@/server/http/api-error';

interface RegisterPushTokenInput {
  deviceToken: string;
  token: string;
  platform: 'ios' | 'android';
}

/** POST /push-tokens — 폐기됐거나 없는 기기 토큰이면 UNAUTHENTICATED */
export async function registerPushToken(db: DbClient, input: RegisterPushTokenInput): Promise<void> {
  const device = await findDeviceCredential(db, input.deviceToken);
  if (!device) throw new ApiError('UNAUTHENTICATED');
  await db.pushToken.deleteMany({ where: { token: input.token, deviceCredentialId: { not: device.id } } });
  await db.pushToken.upsert({
    where: { deviceCredentialId: device.id },
    create: { deviceCredentialId: device.id, userId: device.userId, token: input.token, platform: input.platform },
    update: { userId: device.userId, token: input.token, platform: input.platform },
  });
}
