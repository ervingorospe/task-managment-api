-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "clientId" INTEGER;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;
