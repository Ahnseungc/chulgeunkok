import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { readFileSync } from 'node:fs';
const dir = process.argv[2] ?? new URL('../prisma', import.meta.url).pathname;
const db = new PGlite({ extensions: { btree_gist } });
await db.exec(readFileSync(`${dir}/migrations/0000_init/migration.sql`, 'utf8'));
await db.exec(readFileSync(`${dir}/migrations/0001_constraints/migration.sql`, 'utf8'));
console.log('migrations OK');
const expectFail = async (name, sql) => {
  try { await db.exec(sql); console.log('FAIL(통과됨):', name); }
  catch (e) { console.log('OK 거부:', name, '-', e.message.split('\n')[0]); }
};
await db.exec(`
INSERT INTO "User"(id,name,"updatedAt") VALUES ('u1','사장',now()),('u2','알바',now());
INSERT INTO "Store"(id,name,"updatedAt") VALUES ('s1','카페',now());
INSERT INTO "Membership"(id,"storeId","userId",role) VALUES ('m1','s1','u2','EMPLOYEE');
INSERT INTO "EmploymentTerms"(id,"membershipId",version,"effectiveFrom","effectiveTo","hourlyWage","contractStartDate","createdById")
  VALUES ('t1','m1',1,'2026-01-01','2026-06-01',10320,'2026-01-01','u1'),
         ('t2','m1',2,'2026-06-01',NULL,11000,'2026-01-01','u1');
INSERT INTO "Attendance"(id,"storeId","membershipId","termsId","clockInAt","updatedAt") VALUES ('a1','s1','m1','t2',now(),now());
INSERT INTO "StoreQrToken"(id,"storeId","tokenHash") VALUES ('q1','s1','h1');
`);
console.log('정상 데이터 OK (연속 기간 [) 경계 허용)');
await expectFail('근로조건 기간 겹침', `INSERT INTO "EmploymentTerms"(id,"membershipId",version,"effectiveFrom","hourlyWage","contractStartDate","createdById") VALUES ('t3','m1',3,'2026-07-01',12000,'2026-01-01','u1')`);
await expectFail('OPEN 근무 중복', `INSERT INTO "Attendance"(id,"storeId","membershipId","termsId","clockInAt","updatedAt") VALUES ('a2','s1','m1','t2',now(),now())`);
await expectFail('활성 QR 중복', `INSERT INTO "StoreQrToken"(id,"storeId","tokenHash") VALUES ('q2','s1','h2')`);
await expectFail('퇴근<출근', `UPDATE "Attendance" SET "clockOutAt"="clockInAt" - interval '1 hour', status='CLOSED' WHERE id='a1'`);
await expectFail('CLOSED인데 퇴근 없음', `UPDATE "Attendance" SET status='CLOSED' WHERE id='a1'`);
await expectFail('휴게>=근무', `INSERT INTO "EmploymentTermsSchedule"(id,"termsId",weekday,"startMinute","workMinutes","breakMinutes") VALUES ('sc1','t2',1,1080,60,60)`);
await db.exec(`UPDATE "StoreQrToken" SET "revokedAt"=now() WHERE id='q1'; INSERT INTO "StoreQrToken"(id,"storeId","tokenHash") VALUES ('q2','s1','h2');`);
console.log('QR 폐기 후 재발급 OK');
