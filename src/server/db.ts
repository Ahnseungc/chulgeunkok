import { createRequire } from 'node:module';

import { PrismaClient } from '@prisma/client';

/** `DATABASE_URL="pglite:./.pglite"` → 로컬 Postgres 없이 PGlite 파일 DB로 개발 */
const PGLITE_URL_PREFIX = 'pglite:';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/** 개발 중 HMR로 클라이언트가 여러 개 생기지 않도록 전역에 1개만 둔다. */
export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;

function createClient(): PrismaClient {
  const url = process.env.DATABASE_URL ?? '';
  if (process.env.NODE_ENV !== 'production' && url.startsWith(PGLITE_URL_PREFIX)) {
    return createPgliteClient(url.slice(PGLITE_URL_PREFIX.length));
  }
  return new PrismaClient();
}

/**
 * ponytail: 개발 전용. devDependency라 정적 import 하면 production 번들에 들어가므로
 * 런타임 require로만 부른다. DB 준비는 `pnpm dev:db`(scripts/dev-db.mjs).
 * PGlite는 한 프로세스만 파일을 열 수 있어 dev 서버와 dev:db를 동시에 돌리지 않는다.
 */
function createPgliteClient(dataDir: string): PrismaClient {
  const require = createRequire(import.meta.url);
  const { PGlite } = require('@electric-sql/pglite');
  const { btree_gist } = require('@electric-sql/pglite/contrib/btree_gist');
  const { PrismaPGlite } = require('pglite-prisma-adapter');
  const pglite = new PGlite(dataDir, { extensions: { btree_gist } });
  return new PrismaClient({ adapter: new PrismaPGlite(pglite) });
}
