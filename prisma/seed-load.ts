/**
 * Load-test seeder — generates realistic volume for pagination, filtering,
 * and performance testing. Separate from prisma/seed.ts (which only seeds
 * the essential reference data: rule categories/rules/default role & tag
 * templates) — run that one first, this one depends on it.
 *
 *   npx prisma db seed        # essentials (idempotent, safe to rerun)
 *   npm run db:seed:load      # this file (NOT idempotent — adds new rows every run)
 *
 * Counts are deliberately just constants at the top — change them freely.
 */
import 'dotenv/config';
import { faker } from '@faker-js/faker';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { formatReferenceId } from '../src/common/helper/reference-id.helper';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

// ---------------------------------------------------------------------------
// Counts — tune these
// ---------------------------------------------------------------------------
const COUNTS = {
  users: 5000,
  owners: 500, // subset of `users`, becomes organization owners
  clients: 200, // subset of `users`, seeded as Client-role members
  organizations: 6000,
  ticketsTotal: 100_000,
  requestsTotal: 100_000,
  commentsTotal: 10_000,
  orgsWithExtraRoleAndTag: 600, // 1 in 10 orgs gets a custom role + tag too
};

const BATCH = 2000;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size));
  return out;
}

async function runBatches<T>(
  label: string,
  items: T[],
  fn: (batch: T[]) => Promise<unknown>,
) {
  const batches = chunks(items, BATCH);
  for (let i = 0; i < batches.length; i++) {
    await fn(batches[i]);
    if (i % 5 === 0 || i === batches.length - 1) {
      const done = Math.min((i + 1) * BATCH, items.length);
      console.log(`  ${label}: ${done}/${items.length}`);
    }
  }
}

/** createMany, then fetch the new rows back (ordered by id, matching insertion order). */
async function createManyReturning(model: any, data: any[], label: string) {
  const before = (await model.aggregate({ _max: { id: true } }))._max.id ?? 0;
  await runBatches(label, data, (batch) => model.createMany({ data: batch }));
  return model.findMany({
    where: { id: { gt: before } },
    orderBy: { id: 'asc' },
  });
}

/** Bulk-insert an implicit many-to-many join table via raw SQL — safe here
 * because every value is an integer id we generated ourselves, never
 * user input. */
async function bulkInsertJoin(
  table: string,
  pairs: [number, number][],
  label: string,
) {
  for (const batch of chunks(pairs, 5000)) {
    if (batch.length === 0) continue;
    const values = batch.map(([a, b]) => `(${a},${b})`).join(',');
    await prisma.$executeRawUnsafe(
      `INSERT INTO "${table}" ("A","B") VALUES ${values} ON CONFLICT DO NOTHING`,
    );
  }
  console.log(`  ${label}: ${pairs.length} links`);
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickSome<T>(arr: T[], min: number, max: number): T[] {
  const n = Math.min(
    arr.length,
    Math.floor(Math.random() * (max - min + 1)) + min,
  );
  return faker.helpers.arrayElements(arr, n);
}

function randomPastDate(daysBack: number): Date {
  return faker.date.recent({ days: daysBack });
}

/** Schema columns are `@db.VarChar(n)` in a few places — faker output isn't
 * bounded, so clip anything going into one of those columns. */
function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

async function main() {
  console.time('seed-load');

  // -- Reference data must already exist (run `npx prisma db seed` first) --
  const globalRoles = await prisma.role.findMany({
    where: { orgId: null },
    include: { rules: true },
  });
  const globalTags = await prisma.tag.findMany({ where: { orgId: null } });
  const allRules = await prisma.rule.findMany();
  if (globalRoles.length === 0 || globalTags.length === 0) {
    throw new Error(
      'Run `npx prisma db seed` first — no global role/tag templates found.',
    );
  }
  const roleTemplateByName = new Map(globalRoles.map((r) => [r.roleName, r]));

  // ---------------------------------------------------------------------
  // 1. Users — first `owners` become OWNER accounts, the next `clients`
  //    are earmarked (but stored the same as everyone else) as the pool
  //    of Client-role members, the rest are the general staff pool.
  // ---------------------------------------------------------------------
  console.log(`Seeding ${COUNTS.users} users...`);
  const userInputs = Array.from({ length: COUNTS.users }, (_, i) => {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    return {
      firstName,
      lastName,
      email: `seed.user${i}@example.test`,
      avatar: `https://i.pravatar.cc/64?u=seed-user-${i}`,
      accountType: i < COUNTS.owners ? ('OWNER' as const) : ('MEMBER' as const),
    };
  });
  const users = await createManyReturning(prisma.user, userInputs, 'users');
  const ownerUsers = users.slice(0, COUNTS.owners);
  const clientUsers = users.slice(
    COUNTS.owners,
    COUNTS.owners + COUNTS.clients,
  );
  const staffUsers = users.slice(COUNTS.owners + COUNTS.clients);

  // ---------------------------------------------------------------------
  // 2. Organizations (+ settings + capacity)
  // ---------------------------------------------------------------------
  console.log(`Seeding ${COUNTS.organizations} organizations...`);
  const orgInputs = Array.from({ length: COUNTS.organizations }, (_, i) => ({
    ownerId: pick(ownerUsers).id,
    organizationName: truncate(`${faker.company.name()} ${i}`, 50),
    organizationDesc: faker.company.catchPhrase(),
    email: truncate(faker.internet.email().toLowerCase(), 50),
    website: truncate(faker.internet.url(), 50),
  }));
  const organizations = await createManyReturning(
    prisma.organization,
    orgInputs,
    'organizations',
  );

  await runBatches(
    'org settings',
    organizations.map((org: any, i: number) => ({
      orgId: org.id,
      slug: `${faker.helpers.slugify(org.organizationName).toLowerCase()}-${i}`,
      timezone: faker.helpers.arrayElement([
        'America/New_York',
        'America/Los_Angeles',
        'Europe/London',
        'Asia/Manila',
        'Asia/Singapore',
        'Australia/Sydney',
      ]),
      logo: null,
    })),
    (batch) => prisma.organizationSettings.createMany({ data: batch }),
  );

  await runBatches(
    'org capacity',
    organizations.map((org: any) => ({ orgId: org.id })),
    (batch) => prisma.organizationCapacity.createMany({ data: batch }),
  );

  // ---------------------------------------------------------------------
  // 3. Roles per org (clone the 4 global templates), + a custom role for
  //    a subset of orgs ("add some roles").
  // ---------------------------------------------------------------------
  console.log('Seeding roles per organization...');
  const roleTemplates = ['Superadmin', 'Client', 'Member', 'Admin'] as const;
  const orgsWithExtras = new Set(
    faker.helpers.arrayElements(
      organizations.map((o: any) => o.id),
      COUNTS.orgsWithExtraRoleAndTag,
    ),
  );

  const roleInputs: {
    orgId: number;
    roleName: string;
    roleDesc: string | null;
    isDefault: boolean;
    isLocked: boolean;
    _templateName?: string;
  }[] = [];
  for (const org of organizations) {
    for (const templateName of roleTemplates) {
      const template = roleTemplateByName.get(templateName)!;
      roleInputs.push({
        orgId: org.id,
        roleName: template.roleName,
        roleDesc: template.roleDesc,
        isDefault: true,
        isLocked: template.isLocked,
        _templateName: templateName,
      });
    }
    if (orgsWithExtras.has(org.id)) {
      roleInputs.push({
        orgId: org.id,
        roleName: 'Support Lead',
        roleDesc: 'Escalation point for support tickets.',
        isDefault: false,
        isLocked: false,
        _templateName: undefined,
      });
    }
  }

  const roleCreateData = roleInputs.map(({ _templateName, ...rest }) => rest);
  const createdRoles = await createManyReturning(
    prisma.role,
    roleCreateData,
    'roles',
  );

  // createMany preserves array order -> sequential ids, so zip back up.
  const roleRulePairs: [number, number][] = [];
  const orgRoleIndex = new Map<number, Record<string, number>>(); // orgId -> { roleName: roleId }
  const supportLeadRuleIds = allRules
    .filter((r: any) =>
      [
        'ticket.view.all',
        'ticket.assign',
        'ticket.change.status',
        'member.view.clients',
      ].includes(r.action),
    )
    .map((r: any) => r.id);

  createdRoles.forEach((role: any, i: number) => {
    const input = roleInputs[i];
    if (!orgRoleIndex.has(role.orgId)) orgRoleIndex.set(role.orgId, {});
    orgRoleIndex.get(role.orgId)![role.roleName] = role.id;

    if (input._templateName) {
      const template = roleTemplateByName.get(input._templateName)!;
      for (const rule of template.rules) roleRulePairs.push([role.id, rule.id]);
    } else {
      for (const ruleId of supportLeadRuleIds)
        roleRulePairs.push([role.id, ruleId]);
    }
  });

  await bulkInsertJoin('_RoleRules', roleRulePairs, 'role-rule links');

  // ---------------------------------------------------------------------
  // 4. Tags per org (clone the 4 global templates + an "Urgent" tag for
  //    the same extras subset — "add some ... tags").
  // ---------------------------------------------------------------------
  console.log('Seeding tags per organization...');
  const tagInputs: {
    orgId: number;
    tagName: string;
    color: string;
    isDefault: boolean;
  }[] = [];
  for (const org of organizations) {
    for (const tpl of globalTags) {
      tagInputs.push({
        orgId: org.id,
        tagName: tpl.tagName,
        color: tpl.color,
        isDefault: true,
      });
    }
    if (orgsWithExtras.has(org.id)) {
      tagInputs.push({
        orgId: org.id,
        tagName: 'Urgent',
        color: '#C23A3F',
        isDefault: false,
      });
    }
  }
  const createdTags = await createManyReturning(prisma.tag, tagInputs, 'tags');

  const orgTagIndex = new Map<number, number[]>(); // orgId -> tagIds
  for (const tag of createdTags) {
    if (!orgTagIndex.has(tag.orgId)) orgTagIndex.set(tag.orgId, []);
    orgTagIndex.get(tag.orgId)!.push(tag.id);
  }

  // ---------------------------------------------------------------------
  // 5. Members — the owner (Superadmin), 1 client, and a handful of staff
  //    per organization.
  // ---------------------------------------------------------------------
  console.log('Seeding members per organization...');
  const memberInputs: {
    orgId: number;
    userId: number;
    roleId: number;
    firstName: string;
    lastName: string;
    email: string;
    _kind: 'owner' | 'client' | 'staff';
  }[] = [];
  for (const org of organizations) {
    const roles = orgRoleIndex.get(org.id)!;
    const owner = ownerUsers.find((u: any) => u.id === org.ownerId)!;
    memberInputs.push({
      orgId: org.id,
      userId: owner.id,
      roleId: roles.Superadmin,
      firstName: owner.firstName,
      lastName: owner.lastName,
      email: owner.email,
      _kind: 'owner',
    });

    const client = pick(clientUsers);
    memberInputs.push({
      orgId: org.id,
      userId: client.id,
      roleId: roles.Client,
      firstName: client.firstName,
      lastName: client.lastName,
      email: client.email,
      _kind: 'client',
    });

    for (const staff of pickSome(staffUsers, 2, 6)) {
      memberInputs.push({
        orgId: org.id,
        userId: staff.id,
        roleId: Math.random() < 0.2 ? roles.Admin : roles.Member,
        firstName: staff.firstName,
        lastName: staff.lastName,
        email: staff.email,
        _kind: 'staff',
      });
    }
  }
  const memberCreateData = memberInputs.map(({ _kind, ...rest }) => rest);
  const createdMembers = await createManyReturning(
    prisma.member,
    memberCreateData,
    'members',
  );

  const orgClientMembers = new Map<number, number[]>();
  const orgAssignableMembers = new Map<number, number[]>(); // staff + owner, not clients
  createdMembers.forEach((member: any, i: number) => {
    const kind = memberInputs[i]._kind;
    if (kind === 'client') {
      if (!orgClientMembers.has(member.orgId))
        orgClientMembers.set(member.orgId, []);
      orgClientMembers.get(member.orgId)!.push(member.id);
    } else {
      if (!orgAssignableMembers.has(member.orgId))
        orgAssignableMembers.set(member.orgId, []);
      orgAssignableMembers.get(member.orgId)!.push(member.id);
    }
  });

  // ---------------------------------------------------------------------
  // 6. Tickets, distributed across orgs, with per-org sequential
  //    reference ids and a handful of random assignees each.
  // ---------------------------------------------------------------------
  console.log(`Seeding ${COUNTS.ticketsTotal} tickets...`);
  const orgIds = organizations.map((o: any) => o.id);
  const ticketCounters = new Map<number, number>();
  const ticketInputs: any[] = [];
  const ticketAssigneesByIndex: number[][] = [];

  for (let i = 0; i < COUNTS.ticketsTotal; i++) {
    const orgId = pick(orgIds);
    const tags = orgTagIndex.get(orgId)!;
    const clients = orgClientMembers.get(orgId) ?? [];
    const assignable = orgAssignableMembers.get(orgId) ?? [];

    const count = (ticketCounters.get(orgId) ?? 0) + 1;
    ticketCounters.set(orgId, count);

    const createdAt = randomPastDate(180);
    const hasDueDate = Math.random() < 0.6;

    ticketInputs.push({
      orgId,
      referenceId: formatReferenceId('tckt', count - 1),
      title: faker.hacker.phrase(),
      description: Math.random() < 0.7 ? faker.lorem.paragraph() : null,
      tagId: pick(tags),
      clientId: clients.length && Math.random() < 0.7 ? pick(clients) : null,
      dueDate: hasDueDate
        ? faker.date.between({
            from: faker.date.recent({ days: 30 }),
            to: faker.date.soon({ days: 30 }),
          })
        : null,
      starred: Math.random() < 0.1,
      createdAt,
      updatedAt: createdAt,
    });
    ticketAssigneesByIndex.push(
      assignable.length ? pickSome(assignable, 0, 3) : [],
    );
  }

  const createdTickets = await createManyReturning(
    prisma.ticket,
    ticketInputs,
    'tickets',
  );

  const assigneePairs: [number, number][] = [];
  createdTickets.forEach((ticket: any, i: number) => {
    for (const memberId of ticketAssigneesByIndex[i])
      assigneePairs.push([memberId, ticket.id]);
  });
  await bulkInsertJoin(
    '_TicketAssignees',
    assigneePairs,
    'ticket-assignee links',
  );

  // ---------------------------------------------------------------------
  // 7. Ticket requests, distributed across orgs. Kept independent of the
  //    tickets generated above (ticketId left null) — this is volume for
  //    pagination/filter testing, not a fully wired approval story.
  // ---------------------------------------------------------------------
  console.log(`Seeding ${COUNTS.requestsTotal} ticket requests...`);
  const requestCounters = new Map<number, number>();
  const requestInputs: any[] = [];

  for (let i = 0; i < COUNTS.requestsTotal; i++) {
    const orgId = pick(orgIds);
    const clients = orgClientMembers.get(orgId);
    if (!clients?.length) continue;

    const count = (requestCounters.get(orgId) ?? 0) + 1;
    requestCounters.set(orgId, count);

    const status = faker.helpers.weightedArrayElement([
      { value: 'PENDING', weight: 3 },
      { value: 'APPROVED', weight: 5 },
      { value: 'REJECTED', weight: 2 },
    ]);
    const createdAt = randomPastDate(180);

    requestInputs.push({
      orgId,
      referenceId: formatReferenceId('req', count - 1),
      title: faker.hacker.phrase(),
      description: Math.random() < 0.7 ? faker.lorem.paragraph() : null,
      clientId: pick(clients),
      status,
      remarks: status === 'REJECTED' ? faker.lorem.sentence() : null,
      createdAt,
      updatedAt: createdAt,
    });
  }
  await createManyReturning(
    prisma.ticketRequest,
    requestInputs,
    'ticket requests',
  );

  // ---------------------------------------------------------------------
  // 8. Comments, spread across a random subset of the tickets just made.
  // ---------------------------------------------------------------------
  console.log(`Seeding ${COUNTS.commentsTotal} ticket comments...`);
  const commentInputs: any[] = [];
  for (let i = 0; i < COUNTS.commentsTotal; i++) {
    const ticket = pick(createdTickets);
    const author = pick(users);
    const createdAt = faker.date.between({
      from: ticket.createdAt,
      to: new Date(),
    });
    commentInputs.push({
      ticketId: ticket.id,
      userId: author.id,
      comment: faker.lorem.sentences({ min: 1, max: 3 }),
      createdAt,
      updatedAt: createdAt,
    });
  }
  await runBatches('comments', commentInputs, (batch) =>
    prisma.ticketComment.createMany({ data: batch }),
  );

  console.timeEnd('seed-load');
  console.log('Done:', {
    users: users.length,
    organizations: organizations.length,
    roles: createdRoles.length,
    tags: createdTags.length,
    members: createdMembers.length,
    tickets: createdTickets.length,
    requests: requestInputs.length,
    comments: commentInputs.length,
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
