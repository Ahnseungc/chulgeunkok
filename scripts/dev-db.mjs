// 로컬 개발용 PGlite 파일 DB를 새로 만들고 데모 데이터를 넣는다.
// 사용: pnpm dev:db  →  .env 에 DATABASE_URL="pglite:./.pglite", DEV_AUTH="1"
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';

const DATA_DIR = '.pglite';
const MIGRATIONS_DIR = 'prisma/migrations';
// 데모 QR 원문 (43자). 실제 토큰은 서버가 난수로 만든다
const DEMO_QR_TOKEN = 'demo-store-qr-token-'.padEnd(43, '0');
const hash = (value) => createHash('sha256').update(value).digest('hex');

rmSync(DATA_DIR, { recursive: true, force: true });
const db = new PGlite(DATA_DIR, { extensions: { btree_gist } });

const migrations = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
for (const name of migrations) {
  await db.exec(readFileSync(join(MIGRATIONS_DIR, name, 'migration.sql'), 'utf8'));
}

await db.exec(`
INSERT INTO "User"(id, name, phone, "updatedAt") VALUES
  ('owner', '김사장', '+821000000001', now()),
  ('staff', '이알바', '+821000000002', now()),
  ('newbie', '박신입', '+821000000003', now());
INSERT INTO "Store"(id, name, latitude, longitude, "updatedAt")
  VALUES ('store', '골목카페 망원점', 37.5556, 126.9019, now());
INSERT INTO "Membership"(id, "storeId", "userId", role) VALUES
  ('m-owner', 'store', 'owner', 'OWNER'),
  ('m-staff', 'store', 'staff', 'EMPLOYEE'),
  ('m-newbie', 'store', 'newbie', 'EMPLOYEE');
INSERT INTO "StoreQrToken"(id, "storeId", "tokenHash") VALUES ('qr', 'store', '${hash(DEMO_QR_TOKEN)}');
INSERT INTO "EmploymentTerms"(id, "membershipId", version, "effectiveFrom", "hourlyWage", "weeklyHolidayWeekday", "contractStartDate", "createdById")
  VALUES ('terms-staff', 'm-staff', 1, '2026-01-01T00:00:00+09:00', 10320, 0, '2026-01-01', 'owner');
INSERT INTO "EmploymentTermsSchedule"(id, "termsId", weekday, "startMinute", "workMinutes", "breakMinutes")
  SELECT 'sched-' || d, 'terms-staff', d, 1080, 300, 30 FROM generate_series(1, 5) AS d;
`);
await db.close();

console.log(`PGlite 개발 DB 준비 완료 (${DATA_DIR}, 마이그레이션 ${migrations.length}개)

QR 랜딩: http://localhost:3000/p/${DEMO_QR_TOKEN}
브라우저 쿠키 dev_user_id 로 사용자 선택:
  staff  = 이알바 (근로조건 있음, 출퇴근 가능)
  newbie = 박신입 (근로조건 없음 → TERMS_NOT_SET)
  owner  = 김사장 (근로조건 없음)`);
