-- AlterTable
ALTER TABLE "activity_log_entries" ALTER COLUMN "orgId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "ownerId" INTEGER,
ALTER COLUMN "orgId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "activity_log_entries_actorId_idx" ON "activity_log_entries"("actorId");

-- CreateIndex
CREATE INDEX "tickets_ownerId_isDeleted_createdAt_idx" ON "tickets"("ownerId", "isDeleted", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_ownerId_referenceId_key" ON "tickets"("ownerId", "referenceId");

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

