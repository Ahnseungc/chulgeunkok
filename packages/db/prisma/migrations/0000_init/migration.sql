-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'MANAGER', 'EMPLOYEE');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "Permission" AS ENUM ('PAYROLL_READ', 'TERMS_EDIT');

-- CreateEnum
CREATE TYPE "StoreStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "HeadcountBand" AS ENUM ('UNDER_5', 'FIVE_OR_MORE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('OPEN', 'CLOSED', 'MISSING_CLOCK_OUT', 'VOID');

-- CreateEnum
CREATE TYPE "CorrectionType" AS ENUM ('TIME', 'BREAK_WAIVED', 'MISSING_CLOCK_OUT');

-- CreateEnum
CREATE TYPE "CorrectionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELED');

-- CreateEnum
CREATE TYPE "LaborReviewType" AS ENUM ('MINIMUM_WAGE', 'BREAK_SHORTAGE', 'WEEKLY_HOLIDAY', 'SHORT_TIME_OVERTIME', 'NIGHT_WORK', 'OVERTIME', 'HOLIDAY_WORK', 'ABSENCE_SUSPECTED', 'SEVERANCE', 'ANNUAL_LEAVE');

-- CreateEnum
CREATE TYPE "LaborReviewStatus" AS ENUM ('OPEN', 'NEEDS_INFORMATION', 'ACKNOWLEDGED', 'RESOLVED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "LaborReviewSource" AS ENUM ('EMPLOYMENT_TERMS', 'ATTENDANCE', 'PAY_PERIOD');

-- CreateEnum
CREATE TYPE "SubscriptionPlan" AS ENUM ('PILOT', 'BASIC');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "kakaoId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Store" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Seoul',
    "payPeriodStartDay" INTEGER NOT NULL DEFAULT 1,
    "status" "StoreStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Store_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "permissions" "Permission"[],
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "joinedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMPTZ(3),

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreQrToken" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "StoreQrToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreInvitation" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'EMPLOYEE',
    "phone" TEXT,
    "createdById" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "acceptedAt" TIMESTAMPTZ(3),
    "acceptedById" TEXT,
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreHeadcountDeclaration" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "band" "HeadcountBand" NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "declaredById" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreHeadcountDeclaration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmploymentTerms" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "effectiveFrom" TIMESTAMPTZ(3) NOT NULL,
    "effectiveTo" TIMESTAMPTZ(3),
    "hourlyWage" INTEGER NOT NULL,
    "scheduleVaries" BOOLEAN NOT NULL DEFAULT false,
    "averageWeeklyMinutesOverride" INTEGER,
    "weeklyHolidayWeekday" INTEGER,
    "contractStartDate" DATE NOT NULL,
    "contractEndDate" DATE,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmploymentTerms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmploymentTermsSchedule" (
    "id" TEXT NOT NULL,
    "termsId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "workMinutes" INTEGER NOT NULL,
    "breakMinutes" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "EmploymentTermsSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attendance" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "termsId" TEXT NOT NULL,
    "clockInAt" TIMESTAMPTZ(3) NOT NULL,
    "clockOutAt" TIMESTAMPTZ(3),
    "status" "AttendanceStatus" NOT NULL DEFAULT 'OPEN',
    "clockInLatitude" DOUBLE PRECISION,
    "clockInLongitude" DOUBLE PRECISION,
    "clockInAccuracyM" INTEGER,
    "clockInOutsideArea" BOOLEAN,
    "breakWaived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CorrectionRequest" (
    "id" TEXT NOT NULL,
    "attendanceId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "type" "CorrectionType" NOT NULL,
    "proposedClockInAt" TIMESTAMPTZ(3),
    "proposedClockOutAt" TIMESTAMPTZ(3),
    "reason" TEXT NOT NULL,
    "status" "CorrectionStatus" NOT NULL DEFAULT 'PENDING',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMPTZ(3),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CorrectionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceRevision" (
    "id" TEXT NOT NULL,
    "attendanceId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "correctionRequestId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "responseStatus" INTEGER NOT NULL,
    "responseBody" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LaborReview" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "type" "LaborReviewType" NOT NULL,
    "status" "LaborReviewStatus" NOT NULL DEFAULT 'OPEN',
    "sourceType" "LaborReviewSource" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "ruleVersion" TEXT NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "acknowledgedById" TEXT,
    "acknowledgedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "LaborReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LaborRuleSet" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "minimumHourlyWage" INTEGER NOT NULL,
    "rules" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LaborRuleSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "plan" "SubscriptionPlan" NOT NULL,
    "status" "SubscriptionStatus" NOT NULL,
    "periodStart" TIMESTAMPTZ(3) NOT NULL,
    "periodEnd" TIMESTAMPTZ(3) NOT NULL,
    "billedActiveMembers" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_kakaoId_key" ON "User"("kakaoId");

-- CreateIndex
CREATE INDEX "Membership_userId_idx" ON "Membership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_storeId_userId_key" ON "Membership"("storeId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "StoreQrToken_tokenHash_key" ON "StoreQrToken"("tokenHash");

-- CreateIndex
CREATE INDEX "StoreQrToken_storeId_idx" ON "StoreQrToken"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "StoreInvitation_tokenHash_key" ON "StoreInvitation"("tokenHash");

-- CreateIndex
CREATE INDEX "StoreInvitation_storeId_idx" ON "StoreInvitation"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "StoreHeadcountDeclaration_storeId_effectiveFrom_key" ON "StoreHeadcountDeclaration"("storeId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "EmploymentTerms_membershipId_effectiveFrom_idx" ON "EmploymentTerms"("membershipId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "EmploymentTerms_membershipId_version_key" ON "EmploymentTerms"("membershipId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "EmploymentTermsSchedule_termsId_weekday_key" ON "EmploymentTermsSchedule"("termsId", "weekday");

-- CreateIndex
CREATE INDEX "Attendance_storeId_clockInAt_idx" ON "Attendance"("storeId", "clockInAt");

-- CreateIndex
CREATE INDEX "Attendance_membershipId_clockInAt_idx" ON "Attendance"("membershipId", "clockInAt");

-- CreateIndex
CREATE INDEX "Attendance_status_idx" ON "Attendance"("status");

-- CreateIndex
CREATE INDEX "CorrectionRequest_attendanceId_idx" ON "CorrectionRequest"("attendanceId");

-- CreateIndex
CREATE INDEX "CorrectionRequest_status_createdAt_idx" ON "CorrectionRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AttendanceRevision_attendanceId_createdAt_idx" ON "AttendanceRevision"("attendanceId", "createdAt");

-- CreateIndex
CREATE INDEX "IdempotencyKey_expiresAt_idx" ON "IdempotencyKey"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyKey_userId_key_key" ON "IdempotencyKey"("userId", "key");

-- CreateIndex
CREATE INDEX "LaborReview_membershipId_status_idx" ON "LaborReview"("membershipId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "LaborReview_membershipId_type_sourceType_sourceId_key" ON "LaborReview"("membershipId", "type", "sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "LaborRuleSet_version_key" ON "LaborRuleSet"("version");

-- CreateIndex
CREATE INDEX "LaborRuleSet_effectiveFrom_idx" ON "LaborRuleSet"("effectiveFrom");

-- CreateIndex
CREATE INDEX "Subscription_storeId_periodStart_idx" ON "Subscription"("storeId", "periodStart");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreQrToken" ADD CONSTRAINT "StoreQrToken_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreInvitation" ADD CONSTRAINT "StoreInvitation_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreInvitation" ADD CONSTRAINT "StoreInvitation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreInvitation" ADD CONSTRAINT "StoreInvitation_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreHeadcountDeclaration" ADD CONSTRAINT "StoreHeadcountDeclaration_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreHeadcountDeclaration" ADD CONSTRAINT "StoreHeadcountDeclaration_declaredById_fkey" FOREIGN KEY ("declaredById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmploymentTerms" ADD CONSTRAINT "EmploymentTerms_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmploymentTerms" ADD CONSTRAINT "EmploymentTerms_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmploymentTermsSchedule" ADD CONSTRAINT "EmploymentTermsSchedule_termsId_fkey" FOREIGN KEY ("termsId") REFERENCES "EmploymentTerms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_termsId_fkey" FOREIGN KEY ("termsId") REFERENCES "EmploymentTerms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorrectionRequest" ADD CONSTRAINT "CorrectionRequest_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES "Attendance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorrectionRequest" ADD CONSTRAINT "CorrectionRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorrectionRequest" ADD CONSTRAINT "CorrectionRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRevision" ADD CONSTRAINT "AttendanceRevision_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES "Attendance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRevision" ADD CONSTRAINT "AttendanceRevision_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRevision" ADD CONSTRAINT "AttendanceRevision_correctionRequestId_fkey" FOREIGN KEY ("correctionRequestId") REFERENCES "CorrectionRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaborReview" ADD CONSTRAINT "LaborReview_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaborReview" ADD CONSTRAINT "LaborReview_acknowledgedById_fkey" FOREIGN KEY ("acknowledgedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

