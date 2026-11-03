-- CreateEnum
CREATE TYPE "InvitationKind" AS ENUM ('JOIN', 'REREGISTER');

-- AlterTable
ALTER TABLE "StoreInvitation" DROP COLUMN "phone",
ADD COLUMN     "kind" "InvitationKind" NOT NULL DEFAULT 'JOIN',
ADD COLUMN     "memberId" TEXT;

-- CreateTable
CREATE TABLE "DeviceCredential" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "DeviceCredential_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeviceCredential_tokenHash_key" ON "DeviceCredential"("tokenHash");

-- CreateIndex
CREATE INDEX "DeviceCredential_userId_idx" ON "DeviceCredential"("userId");

-- AddForeignKey
ALTER TABLE "StoreInvitation" ADD CONSTRAINT "StoreInvitation_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceCredential" ADD CONSTRAINT "DeviceCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ─── 수기 추가: CHECK ─────────────────────────────────────

-- 기기 재등록 초대만 대상 직원이 있다
ALTER TABLE "StoreInvitation"
  ADD CONSTRAINT "StoreInvitation_reregister_member_check"
  CHECK (("kind" = 'REREGISTER') = ("memberId" IS NOT NULL));
