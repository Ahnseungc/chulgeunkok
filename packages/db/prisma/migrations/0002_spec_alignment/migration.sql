-- DropIndex
DROP INDEX "LaborReview_membershipId_type_sourceType_sourceId_key";

-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "payPeriodStartDayEffectiveFrom" DATE,
ADD COLUMN     "previousPayPeriodStartDay" INTEGER;

-- AlterTable
ALTER TABLE "LaborReview" ADD COLUMN     "seenAt" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "OtpCode" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "consumedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OtpCode_phone_createdAt_idx" ON "OtpCode"("phone", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LaborReview_membershipId_type_sourceType_sourceId_ruleVersi_key" ON "LaborReview"("membershipId", "type", "sourceType", "sourceId", "ruleVersion");


-- ─── 수기 추가: CHECK ─────────────────────────────────────

-- 이전 시작일과 기준일은 함께 있거나 함께 없다
ALTER TABLE "Store"
  ADD CONSTRAINT "Store_previousPayPeriodStartDay_check"
  CHECK (
    ("previousPayPeriodStartDay" IS NULL) = ("payPeriodStartDayEffectiveFrom" IS NULL)
    AND ("previousPayPeriodStartDay" IS NULL OR "previousPayPeriodStartDay" BETWEEN 1 AND 28)
  );

ALTER TABLE "OtpCode"
  ADD CONSTRAINT "OtpCode_attempts_check"
  CHECK ("attempts" BETWEEN 0 AND 5);

-- ─── 수기 추가: 시드 ──────────────────────────────────────

-- 자동 처리(퇴근 누락 전환 등) actor. 로그인 수단이 없어 로그인할 수 없다
INSERT INTO "User" ("id", "name", "updatedAt")
VALUES ('system', '시스템', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- 2026 규칙 세트. 값은 노무사 검증 전 설계 가정 (docs/specs/labor)
INSERT INTO "LaborRuleSet" ("id", "version", "effectiveFrom", "minimumHourlyWage", "rules")
VALUES (
  'ruleset_2026_1',
  '2026.1',
  '2026-01-01',
  10320,
  '{
    "breakRequirements": [
      { "minLaborMinutes": 480, "breakMinutes": 60 },
      { "minLaborMinutes": 240, "breakMinutes": 30 }
    ],
    "weeklyHolidayMinWeeklyMinutes": 900,
    "shortTimeWeeklyMinutesBelow": 2400,
    "night": { "startMinute": 1320, "endMinute": 360 },
    "overtime": { "dailyMinutes": 480, "weeklyMinutes": 2400 },
    "premiumRate": 0.5
  }'::jsonb
)
ON CONFLICT ("version") DO NOTHING;
