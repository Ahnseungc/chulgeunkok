-- 실제 휴게 시작·종료 기록 (docs/specs/attendance §3.6)

-- CreateTable
CREATE TABLE "AttendanceBreak" (
    "id" TEXT NOT NULL,
    "attendanceId" TEXT NOT NULL,
    "startAt" TIMESTAMPTZ(3) NOT NULL,
    "endAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceBreak_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AttendanceBreak_attendanceId_startAt_idx" ON "AttendanceBreak"("attendanceId", "startAt");

-- AddForeignKey
ALTER TABLE "AttendanceBreak" ADD CONSTRAINT "AttendanceBreak_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES "Attendance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Prisma 스키마로 표현할 수 없는 제약

-- 근무당 열린 휴게 1개
CREATE UNIQUE INDEX "AttendanceBreak_attendanceId_open_key"
  ON "AttendanceBreak" ("attendanceId")
  WHERE "endAt" IS NULL;

-- 관리자가 퇴근 시각을 휴게 시작보다 앞으로 당기면 시작 시각으로 닫으므로 같아도 된다
ALTER TABLE "AttendanceBreak"
  ADD CONSTRAINT "AttendanceBreak_end_after_start_check"
  CHECK ("endAt" IS NULL OR "endAt" >= "startAt");
