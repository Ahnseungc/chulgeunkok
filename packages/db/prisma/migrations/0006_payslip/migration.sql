-- CreateEnum
CREATE TYPE "PayslipStatus" AS ENUM ('DRAFT', 'SENT', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "DeductionType" AS ENUM ('NONE', 'WITHHOLDING_3_3', 'SOCIAL_INSURANCE');

-- CreateEnum
CREATE TYPE "PayslipLineKind" AS ENUM ('EARNING', 'DEDUCTION');

-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "payDay" INTEGER;

-- AlterTable
ALTER TABLE "EmploymentTerms" ADD COLUMN     "deductionType" "DeductionType" NOT NULL DEFAULT 'NONE';

-- CreateTable
CREATE TABLE "Payslip" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "PayslipStatus" NOT NULL DEFAULT 'DRAFT',
    "payDate" DATE,
    "employeeName" TEXT NOT NULL,
    "employeeNumber" INTEGER NOT NULL,
    "workDays" INTEGER NOT NULL,
    "recognizedSeconds" INTEGER NOT NULL,
    "overtimeSeconds" INTEGER NOT NULL,
    "nightSeconds" INTEGER NOT NULL,
    "holidaySeconds" INTEGER NOT NULL,
    "deductionType" "DeductionType" NOT NULL,
    "grossPay" INTEGER NOT NULL,
    "totalDeduction" INTEGER NOT NULL,
    "netPay" INTEGER NOT NULL,
    "correctionNote" TEXT,
    "sentAt" TIMESTAMPTZ(3),
    "sentById" TEXT,
    "viewedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Payslip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayslipLine" (
    "id" TEXT NOT NULL,
    "payslipId" TEXT NOT NULL,
    "kind" "PayslipLineKind" NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "basis" TEXT NOT NULL,
    "calculatedAmount" INTEGER,
    "amount" INTEGER NOT NULL,
    "adjustReason" TEXT,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "PayslipLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushToken" (
    "id" TEXT NOT NULL,
    "deviceCredentialId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PushToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Payslip_storeId_periodStart_idx" ON "Payslip"("storeId", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "Payslip_membershipId_periodStart_version_key" ON "Payslip"("membershipId", "periodStart", "version");

-- CreateIndex
CREATE INDEX "PayslipLine_payslipId_idx" ON "PayslipLine"("payslipId");

-- CreateIndex
CREATE UNIQUE INDEX "PushToken_deviceCredentialId_key" ON "PushToken"("deviceCredentialId");

-- CreateIndex
CREATE UNIQUE INDEX "PushToken_token_key" ON "PushToken"("token");

-- CreateIndex
CREATE INDEX "PushToken_userId_idx" ON "PushToken"("userId");

-- AddForeignKey
ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayslipLine" ADD CONSTRAINT "PayslipLine_payslipId_fkey" FOREIGN KEY ("payslipId") REFERENCES "Payslip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushToken" ADD CONSTRAINT "PushToken_deviceCredentialId_fkey" FOREIGN KEY ("deviceCredentialId") REFERENCES "DeviceCredential"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushToken" ADD CONSTRAINT "PushToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- 같은 직원·기간에 DRAFT는 1개 (docs/specs/payslip §4.1)
CREATE UNIQUE INDEX "Payslip_one_draft_per_period" ON "Payslip"("membershipId", "periodStart") WHERE status = 'DRAFT';
ALTER TABLE "Store" ADD CONSTRAINT "Store_payDay_range" CHECK ("payDay" IS NULL OR "payDay" BETWEEN 1 AND 31);
