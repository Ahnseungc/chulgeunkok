import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { readdirSync, readFileSync } from 'node:fs';
const dir = process.argv[2] ?? new URL('../prisma', import.meta.url).pathname;
const db = new PGlite({ extensions: { btree_gist } });
const migrations = readdirSync(`${dir}/migrations`, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();
for (const name of migrations) {
  await db.exec(readFileSync(`${dir}/migrations/${name}/migration.sql`, 'utf8'));
}
console.log('migrations OK:', migrations.join(', '));
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

// 0002
const { rows: seed } = await db.query(`SELECT "minimumHourlyWage" FROM "LaborRuleSet" WHERE version = '2026.1'`);
console.log(seed[0]?.minimumHourlyWage === 10320 ? 'OK 시드: 2026 최저임금 10320' : 'FAIL 시드 없음');
await db.exec(`
INSERT INTO "LaborReview"(id,"membershipId",type,"sourceType","sourceId","ruleVersion","reasonCode","updatedAt")
  VALUES ('r1','m1','MINIMUM_WAGE','EMPLOYMENT_TERMS','t2','2026.1','BELOW_MINIMUM',now()),
         ('r2','m1','MINIMUM_WAGE','EMPLOYMENT_TERMS','t2','2027.1','BELOW_MINIMUM',now());
`);
console.log('규칙 버전이 다르면 같은 사유도 새 행 OK');
await expectFail('같은 규칙 버전 검토 중복', `INSERT INTO "LaborReview"(id,"membershipId",type,"sourceType","sourceId","ruleVersion","reasonCode","updatedAt") VALUES ('r3','m1','MINIMUM_WAGE','EMPLOYMENT_TERMS','t2','2026.1','BELOW_MINIMUM',now())`);
await expectFail('정산 시작일 이전 값만 있음', `UPDATE "Store" SET "previousPayPeriodStartDay"=1 WHERE id='s1'`);
await expectFail('인증 시도 6회', `INSERT INTO "OtpCode"(id,phone,"codeHash",attempts,"expiresAt") VALUES ('o1','+821012345678','h',6,now())`);

// 0006
const payslipRow = (id, version, status) => `INSERT INTO "Payslip"(id,"storeId","membershipId","periodStart","periodEnd",version,status,"employeeName","employeeNumber","workDays","recognizedSeconds","overtimeSeconds","nightSeconds","holidaySeconds","deductionType","grossPay","totalDeduction","netPay","updatedAt") VALUES ('${id}','s1','m1','2026-10-01','2026-11-01',${version},'${status}','알바',1,0,0,0,0,0,'NONE',0,0,0,now())`;
await db.exec(payslipRow('p1', 1, 'SENT'));
await db.exec(payslipRow('p2', 2, 'DRAFT'));
console.log('SENT 1건 + DRAFT 1건 OK');
await expectFail('같은 직원·기간 DRAFT 2건', payslipRow('p3', 3, 'DRAFT'));
await expectFail('급여 지급일 32', `UPDATE "Store" SET "payDay"=32 WHERE id='s1'`);

// 0008
await db.exec(`INSERT INTO "AttendanceBreak"(id,"attendanceId","startAt") VALUES ('b1','a1',now())`);
console.log('열린 휴게 1개 OK');
await expectFail('같은 근무에 열린 휴게 2개', `INSERT INTO "AttendanceBreak"(id,"attendanceId","startAt") VALUES ('b2','a1',now())`);
await db.exec(`UPDATE "AttendanceBreak" SET "endAt"="startAt" + interval '10 minutes' WHERE id='b1'; INSERT INTO "AttendanceBreak"(id,"attendanceId","startAt") VALUES ('b2','a1',now() + interval '1 hour')`);
console.log('닫은 뒤 새 휴게 OK');
await expectFail('휴게 끝<시작', `UPDATE "AttendanceBreak" SET "endAt"="startAt" - interval '1 minute' WHERE id='b2'`);
