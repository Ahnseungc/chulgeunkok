import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { PrismaClient } from '@prisma/client';
import { PrismaPGlite } from 'pglite-prisma-adapter';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../prisma/migrations');

/**
 * 테스트마다 인메모리 Postgres(PGlite)에 마이그레이션 전체를 적용한 PrismaClient.
 * 부분 유니크·CHECK·exclusion 제약까지 실제와 같게 동작한다.
 */
export async function createTestDb(): Promise<{ db: PrismaClient; close: () => Promise<void> }> {
  const pglite = new PGlite({ extensions: { btree_gist } });
  const migrations = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  for (const name of migrations) {
    await pglite.exec(readFileSync(join(MIGRATIONS_DIR, name, 'migration.sql'), 'utf8'));
  }
  const db = new PrismaClient({ adapter: new PrismaPGlite(pglite) });
  return {
    db,
    close: async () => {
      await db.$disconnect();
      await pglite.close();
    },
  };
}
