/**
 * One-off: real auth now requires a password on every account, but every
 * seeded/demo user (jane@acmestudio.com, alex@clientco.com,
 * loadtest@example.com, etc.) was created before that existed, so
 * `passwordHash` is null on all of them. This sets one shared test
 * password + marks them verified/onboarded so existing manual testing
 * keeps working without redoing signup for each one.
 *
 * Idempotent: only touches rows where passwordHash is still null, so it's
 * safe to rerun — it will never overwrite a real password someone set via
 * actual signup after this ran once.
 *
 * Run: npx tsx prisma/set-seeded-passwords.ts
 */
import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const TEST_PASSWORD = 'TestPass123!';

async function main() {
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);

  const result = await prisma.user.updateMany({
    where: { passwordHash: null, isDeleted: false },
    data: { passwordHash, isVerified: true, hasOnboarded: true },
  });

  console.log(`Updated ${result.count} seeded user(s).`);
  console.log(`Test password for all of them: ${TEST_PASSWORD}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
