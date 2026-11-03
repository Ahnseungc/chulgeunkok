-- Prisma 스키마로 표현할 수 없는 제약. 0000_init(prisma migrate) 다음에 적용한다.

-- ─── 부분 유니크 ─────────────────────────────────────────

-- 직원당 진행 중 근무 1개
CREATE UNIQUE INDEX "Attendance_membershipId_open_key"
  ON "Attendance" ("membershipId")
  WHERE "status" = 'OPEN';

-- 매장당 활성 QR 토큰 1개
CREATE UNIQUE INDEX "StoreQrToken_storeId_active_key"
  ON "StoreQrToken" ("storeId")
  WHERE "revokedAt" IS NULL;

-- 같은 근태에 대기 중 수정 요청 1개
CREATE UNIQUE INDEX "CorrectionRequest_attendanceId_pending_key"
  ON "CorrectionRequest" ("attendanceId")
  WHERE "status" = 'PENDING';

-- ─── CHECK ───────────────────────────────────────────────

ALTER TABLE "Store"
  ADD CONSTRAINT "Store_payPeriodStartDay_check"
  CHECK ("payPeriodStartDay" BETWEEN 1 AND 28);

ALTER TABLE "Attendance"
  ADD CONSTRAINT "Attendance_clockOut_after_clockIn_check"
  CHECK ("clockOutAt" IS NULL OR "clockOutAt" > "clockInAt");

ALTER TABLE "Attendance"
  ADD CONSTRAINT "Attendance_closed_has_clockOut_check"
  CHECK ("status" <> 'CLOSED' OR "clockOutAt" IS NOT NULL);

ALTER TABLE "EmploymentTerms"
  ADD CONSTRAINT "EmploymentTerms_hourlyWage_check"
  CHECK ("hourlyWage" > 0);

ALTER TABLE "EmploymentTerms"
  ADD CONSTRAINT "EmploymentTerms_period_check"
  CHECK ("effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom");

ALTER TABLE "EmploymentTerms"
  ADD CONSTRAINT "EmploymentTerms_weeklyHolidayWeekday_check"
  CHECK ("weeklyHolidayWeekday" IS NULL OR "weeklyHolidayWeekday" BETWEEN 0 AND 6);

ALTER TABLE "EmploymentTerms"
  ADD CONSTRAINT "EmploymentTerms_contract_check"
  CHECK ("contractEndDate" IS NULL OR "contractEndDate" >= "contractStartDate");

ALTER TABLE "EmploymentTermsSchedule"
  ADD CONSTRAINT "EmploymentTermsSchedule_range_check"
  CHECK (
    "weekday" BETWEEN 0 AND 6
    AND "startMinute" BETWEEN 0 AND 1439
    AND "workMinutes" BETWEEN 1 AND 1440
    AND "breakMinutes" >= 0
    AND "breakMinutes" < "workMinutes"
  );

ALTER TABLE "LaborRuleSet"
  ADD CONSTRAINT "LaborRuleSet_minimumHourlyWage_check"
  CHECK ("minimumHourlyWage" > 0);

-- ─── 근로조건 기간 겹침 금지 ──────────────────────────────
-- 시급 적용이 한 시점에 하나로 결정되도록 보장한다. effectiveTo NULL = 무기한

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "EmploymentTerms"
  ADD CONSTRAINT "EmploymentTerms_no_overlap"
  EXCLUDE USING gist (
    "membershipId" WITH =,
    tstzrange("effectiveFrom", "effectiveTo", '[)') WITH &&
  );
