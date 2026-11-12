-- 출퇴근 알림 중복 발송 방지 (docs/specs/notifications §5)

-- CreateEnum
CREATE TYPE "ShiftReminderKind" AS ENUM ('START_SOON', 'START_NOW', 'END_SOON', 'END_NOW');

-- CreateTable
CREATE TABLE "ShiftReminder" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "kind" "ShiftReminderKind" NOT NULL,
    "scheduledAt" TIMESTAMPTZ(3) NOT NULL,
    "sentAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ShiftReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShiftReminder_membershipId_kind_scheduledAt_key" ON "ShiftReminder"("membershipId", "kind", "scheduledAt");

-- AddForeignKey
ALTER TABLE "ShiftReminder" ADD CONSTRAINT "ShiftReminder_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

