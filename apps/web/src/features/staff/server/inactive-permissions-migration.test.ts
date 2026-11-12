import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { PrismaClient } from '@chulgeunkok/db';
import { createTestDb } from '@chulgeunkok/db/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/** 0011 데이터 마이그레이션: 이 규칙 전에 비활성화된 직원의 남은 권한을 비운다 (docs/specs/staff §4.1) */
const MIGRATION_SQL = readFileSync(
  join(__dirname, '../../../../../../packages/db/prisma/migrations/0011_inactive_permissions_reset/migration.sql'),
  'utf8',
);

let db: PrismaClient;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  await db.user.createMany({ data: [{ id: 'owner', name: '김사장' }, { id: 'left', name: '퇴사매니저' }, { id: 'active', name: '현매니저' }] });
  await db.store.create({ data: { id: 'store', name: '골목카페' } });
  await db.membership.createMany({
    data: [
      { id: 'm-owner', storeId: 'store', userId: 'owner', role: 'OWNER' },
      { id: 'm-left', storeId: 'store', userId: 'left', role: 'MANAGER', status: 'INACTIVE', permissions: ['PAYROLL_READ'] },
      { id: 'm-active', storeId: 'store', userId: 'active', role: 'MANAGER', permissions: ['PAYROLL_READ'] },
    ],
  });
});

afterEach(async () => {
  await close();
});

describe('0011_inactive_permissions_reset', () => {
  it('비활성 직원 권한만 비우고 재직 중 매니저 권한은 그대로 둔다', async () => {
    await db.$executeRawUnsafe(MIGRATION_SQL.replace(/^--.*$/gm, '').trim());
    const members = await db.membership.findMany({ where: { id: { in: ['m-left', 'm-active'] } }, orderBy: { id: 'asc' } });
    expect(members.map((member) => [member.id, member.permissions])).toEqual([
      ['m-active', ['PAYROLL_READ']],
      ['m-left', []],
    ]);
  });
});
