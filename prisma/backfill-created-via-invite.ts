/**
 * One-off: `User.createdViaInvite` only gets set going forward, by the real
 * accept-invite flow (see auth.service.ts's acceptInvite() and the invite
 * branch of findOrCreateFromGoogle()). Every account seeded before that
 * field existed defaults to false regardless of how they'd have actually
 * joined — this backfills it for existing data: anyone who belongs to at
 * least one organization but owns none of their own is treated as if
 * they'd joined via invite, since that's what the seed data's own
 * membership structure already implies about how they got there.
 *
 * Idempotent — only touches rows that are still createdViaInvite=false and
 * meet the criteria, so it's safe to rerun (e.g. against Neon later).
 *
 * Run: npx tsx prisma/backfill-created-via-invite.ts
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const candidates = await prisma.user.findMany({
    where: {
      isDeleted: false,
      createdViaInvite: false,
      memberships: { some: { isDeleted: false } },
      ownedOrganizations: { none: { isDeleted: false } },
    },
    select: { id: true, email: true },
  });

  if (candidates.length === 0) {
    console.log('No accounts to backfill.');
    return;
  }

  await prisma.user.updateMany({
    where: { id: { in: candidates.map((c) => c.id) } },
    data: { createdViaInvite: true },
  });

  console.log(
    `Backfilled createdViaInvite=true for ${candidates.length} account(s):`,
  );
  for (const c of candidates) console.log(` - ${c.email}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
