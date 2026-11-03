import { createRequire } from 'node:module';

import { PrismaClient } from '@prisma/client';

/** `DATABASE_URL="pglite:<디렉터리>"` → 로컬 Postgres 없이 PGlite 파일 DB로 개발 */
const PGLITE_URL_PREFIX = 'pglite:';

/**
 * DATABASE_URL에 맞는 PrismaClient. production에서는 항상 Postgres.
 * 앱 쪽에서 프로세스당 1개만 만들어 재사용한다.
 */
export function createDbClient(url = process.env.DATABASE_URL ?? ''): PrismaClient {
  if (process.env.NODE_ENV !== 'production' && url.startsWith(PGLITE_URL_PREFIX)) {
    return createPgliteClient(url.slice(PGLITE_URL_PREFIX.length));
  }
  return new PrismaClient();
}

/**
 * ponytail: 개발 전용. devDependency라 정적 import 하면 production 번들에 들어가므로
 * 런타임 require로만 부른다. DB 준비는 `pnpm db:dev`(scripts/dev-db.mjs).
 * PGlite는 한 프로세스만 파일을 열 수 있어 dev 서버와 db:dev를 동시에 돌리지 않는다.
 */
function createPgliteClient(dataDir: string): PrismaClient {
  const require = createRequire(import.meta.url);
  const { PGlite } = require('@electric-sql/pglite');
  const { btree_gist } = require('@electric-sql/pglite/contrib/btree_gist');
  const { PrismaPGlite } = require('pglite-prisma-adapter');
  const pglite = new PGlite(dataDir, { extensions: { btree_gist } });
  return new PrismaClient({ adapter: new PrismaPGlite(pglite) });
}
