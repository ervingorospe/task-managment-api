-- AlterEnum
ALTER TYPE "InviteStatus" ADD VALUE 'REJECTED';

-- AlterTable: add invitedBy/resentBy as nullable first so existing rows
-- can be backfilled before invitedBy is locked to NOT NULL below.
ALTER TABLE "member_invites" ADD COLUMN "invitedBy" INTEGER;
ALTER TABLE "member_invites" ADD COLUMN "resentBy" INTEGER;

-- Backfill: every existing invite is attributed to its organization's
-- owner (every owner has a Member row created in the same transaction as
-- the organization itself — see OrganizationService.createWithFreshSlug).
UPDATE "member_invites" mi
SET "invitedBy" = m."id"
FROM "members" m
JOIN "organizations" o ON o."id" = m."orgId"
WHERE mi."orgId" = m."orgId"
  AND m."userId" = o."ownerId"
  AND m."isDeleted" = false
  AND mi."invitedBy" IS NULL;

-- AlterTable
ALTER TABLE "member_invites" ALTER COLUMN "invitedBy" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "member_invites" ADD CONSTRAINT "member_invites_invitedBy_fkey" FOREIGN KEY ("invitedBy") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "member_invites" ADD CONSTRAINT "member_invites_resentBy_fkey" FOREIGN KEY ("resentBy") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;
