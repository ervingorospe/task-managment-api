/**
 * Seeds the exact accounts + organization the frontend's mock login
 * (lib/data/mock-accounts.ts) expects — jane/marco/priya/alex @ Acme
 * Studio — but as real rows in this database, so the frontend's login
 * flow can look them up for real instead of reading a local mock array.
 * Run after `npx prisma db seed` (needs the global role/tag templates).
 * Idempotent: upserts by email/slug, safe to rerun.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { formatReferenceId } from '../src/common/helper/reference-id.helper';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const ACCOUNTS = [
  {
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane@acmestudio.com',
    roleName: 'Superadmin',
  },
  {
    firstName: 'Marco',
    lastName: 'Cruz',
    email: 'marco@acmestudio.com',
    roleName: 'Admin',
  },
  {
    firstName: 'Priya',
    lastName: 'Nair',
    email: 'priya@acmestudio.com',
    roleName: 'Member',
  },
  {
    firstName: 'Alex',
    lastName: 'Rivera',
    email: 'alex@clientco.com',
    roleName: 'Client',
  },
];

const TICKET_TITLES = [
  'Fix broken image upload on profile page',
  'Add drag-and-drop file attachments to tickets',
  'Typo in the welcome email subject line',
  'Client portal shows tickets from other orgs',
  'Slow query on the tickets list endpoint',
  'Add CSV export to the reports page',
  'Session expires too quickly on the mobile app',
  'Notification bell shows stale unread count',
];

const REQUEST_TITLES = [
  'Add live chat widget to support page',
  'Allow bulk-closing of resolved tickets',
  'Dark mode for the client portal',
  'Export activity log as PDF',
];

async function main() {
  console.log(
    'Seeding mock-parity accounts (jane/marco/priya/alex @ Acme Studio)...',
  );

  const globalRoles = await prisma.role.findMany({
    where: { orgId: null },
    include: { rules: true },
  });
  const globalTags = await prisma.tag.findMany({ where: { orgId: null } });
  if (globalRoles.length === 0 || globalTags.length === 0) {
    throw new Error(
      'Run `npx prisma db seed` first — no global role/tag templates found.',
    );
  }
  const roleTemplateByName = new Map(globalRoles.map((r) => [r.roleName, r]));

  const users = new Map<
    string,
    { id: number; firstName: string; lastName: string; email: string }
  >();
  for (const account of ACCOUNTS) {
    const user = await prisma.user.upsert({
      where: { email: account.email },
      update: {
        firstName: account.firstName,
        lastName: account.lastName,
        // Revives the account if an earlier test soft-deleted it — this
        // script's whole point is a known-good baseline to come back to,
        // so a previously-deleted mock account should come back working,
        // not stay a ghost row that upsert's email match silently found
        // but never actually restored.
        isDeleted: false,
      },
      create: {
        firstName: account.firstName,
        lastName: account.lastName,
        email: account.email,
        avatar: `https://i.pravatar.cc/64?u=${account.firstName.toLowerCase()}`,
      },
    });
    users.set(account.email, user);
  }

  const owner = users.get('jane@acmestudio.com')!;

  let organization = await prisma.organization.findFirst({
    where: { settings: { slug: 'acme-studio' } },
  });

  if (!organization) {
    organization = await prisma.organization.create({
      data: {
        ownerId: owner.id,
        organizationName: 'Acme Studio',
        organizationDesc:
          'A small studio building tools for independent creators.',
        email: 'hello@acmestudio.com',
        website: 'https://acmestudio.com',
      },
    });
    await prisma.organizationSettings.create({
      data: {
        orgId: organization.id,
        slug: 'acme-studio',
        logo: 'https://i.pravatar.cc/64?u=acme',
        timezone: 'Asia/Manila',
      },
    });
    await prisma.organizationCapacity.create({
      data: { orgId: organization.id },
    });
  }
  const orgId = organization.id;

  const roleIdByName = new Map<string, number>();
  for (const templateName of ['Superadmin', 'Client', 'Member', 'Admin']) {
    const template = roleTemplateByName.get(templateName)!;
    let role = await prisma.role.findFirst({
      where: { orgId, roleName: templateName },
    });
    if (!role) {
      role = await prisma.role.create({
        data: {
          orgId,
          roleName: template.roleName,
          roleDesc: template.roleDesc,
          isDefault: true,
          isLocked: template.isLocked,
          rules: { connect: template.rules.map((r) => ({ id: r.id })) },
        },
      });
    }
    roleIdByName.set(templateName, role.id);
  }

  const tagIds: number[] = [];
  for (const tpl of globalTags) {
    let tag = await prisma.tag.findFirst({
      where: { orgId, tagName: tpl.tagName },
    });
    if (!tag) {
      tag = await prisma.tag.create({
        data: {
          orgId,
          tagName: tpl.tagName,
          color: tpl.color,
          isDefault: true,
        },
      });
    }
    tagIds.push(tag.id);
  }

  const memberByEmail = new Map<string, { id: number }>();
  for (const account of ACCOUNTS) {
    const user = users.get(account.email)!;
    let member = await prisma.member.findFirst({
      where: { orgId, userId: user.id },
    });
    if (!member) {
      member = await prisma.member.create({
        data: {
          orgId,
          userId: user.id,
          roleId: roleIdByName.get(account.roleName)!,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
        },
      });
    }
    memberByEmail.set(account.email, member);
  }

  const client = memberByEmail.get('alex@clientco.com')!;
  const staffPool = [
    memberByEmail.get('marco@acmestudio.com')!,
    memberByEmail.get('priya@acmestudio.com')!,
  ];

  const existingTicketCount = await prisma.ticket.count({ where: { orgId } });
  if (existingTicketCount === 0) {
    for (let i = 0; i < TICKET_TITLES.length; i++) {
      await prisma.ticket.create({
        data: {
          orgId,
          referenceId: formatReferenceId('tckt', i),
          title: TICKET_TITLES[i],
          description: 'Reported via the client portal.',
          tagId: tagIds[i % tagIds.length],
          clientId: i % 3 === 0 ? client.id : null,
          assignees: { connect: [staffPool[i % staffPool.length]] },
          dueDate:
            i % 2 === 0 ? new Date(Date.now() + (i - 3) * 86_400_000) : null,
        },
      });
    }
  }

  const existingRequestCount = await prisma.ticketRequest.count({
    where: { orgId },
  });
  if (existingRequestCount === 0) {
    for (let i = 0; i < REQUEST_TITLES.length; i++) {
      await prisma.ticketRequest.create({
        data: {
          orgId,
          referenceId: formatReferenceId('req', i),
          title: REQUEST_TITLES[i],
          description: 'Submitted by the client.',
          clientId: client.id,
          status: i === 0 ? 'REJECTED' : i === 1 ? 'APPROVED' : 'PENDING',
          remarks: i === 0 ? 'Out of scope for this quarter.' : null,
        },
      });
    }
  }

  console.log(
    `Done. Organization "${organization.organizationName}" (slug: acme-studio, id: ${orgId}).`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
