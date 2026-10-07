-- Starring moves from a plain boolean on tickets (shared/global — one
-- star flipped it for every viewer) to a per-user join table, so each
-- user has their own independent starred set. The old column never
-- recorded *who* starred a ticket, so there's no correct user to
-- backfill existing stars onto; they're cleared, not migrated.

-- DropIndex
DROP INDEX "tickets_orgId_starred_idx";

-- AlterTable
ALTER TABLE "tickets" DROP COLUMN "starred";

-- CreateTable
CREATE TABLE "ticket_starred" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_starred_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ticket_starred_userId_ticketId_key" ON "ticket_starred"("userId", "ticketId");

-- AddForeignKey
ALTER TABLE "ticket_starred" ADD CONSTRAINT "ticket_starred_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_starred" ADD CONSTRAINT "ticket_starred_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
