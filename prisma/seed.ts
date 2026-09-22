import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

// Mirrors the frontend's lib/data/rules-category.ts + default-rules.ts +
// default-roles.ts, restricted to the Authorization Rules this backend was
// given (no member.view.admins / ticket.change.owner — those exist in the
// frontend mock but weren't in this task's rule list, so they're not
// modeled here).
const CATEGORIES = ['Tag', 'Member', 'Role', 'Ticket', 'Report', 'Activity Log'] as const;

const RULES: { action: string; name: string; desc: string; category: (typeof CATEGORIES)[number] }[] = [
  { action: 'tag.view', name: 'View Tags', desc: 'Can view the tags available in the organization.', category: 'Tag' },
  { action: 'tag.add', name: 'Add Tags', desc: 'Can create new tags for the organization.', category: 'Tag' },
  { action: 'tag.update', name: 'Update Tags', desc: "Can edit a tag's name or color.", category: 'Tag' },
  { action: 'tag.remove', name: 'Remove Tags', desc: 'Can delete a tag from the organization.', category: 'Tag' },

  { action: 'member.invite', name: 'Invite Members', desc: 'Can invite new people, and resend or cancel pending invitations.', category: 'Member' },
  { action: 'member.remove', name: 'Remove Members', desc: 'Can remove a member from the organization.', category: 'Member' },
  { action: 'member.update.role', name: "Update Member's Role", desc: "Can change a member's role.", category: 'Member' },
  { action: 'member.view.members', name: 'View Members', desc: 'Can view the list of members in the organization.', category: 'Member' },
  { action: 'member.view.owner', name: 'View Owner', desc: "Can view the organization's owner.", category: 'Member' },
  { action: 'member.view.clients', name: 'View Clients', desc: 'Can view members who hold the Client role.', category: 'Member' },
  { action: 'member.set.active', name: 'Activate/Deactivate Members', desc: "Can activate or deactivate a member's access.", category: 'Member' },

  { action: 'role.view', name: 'View Roles', desc: 'Can view the roles defined in the organization.', category: 'Role' },
  { action: 'role.add', name: 'Add Roles', desc: 'Can create a new role.', category: 'Role' },
  { action: 'role.update', name: 'Update Roles', desc: "Can edit a role's name, description, or permissions.", category: 'Role' },
  { action: 'role.remove', name: 'Remove Roles', desc: 'Can delete a role. Members holding it are reassigned to the default Member role.', category: 'Role' },

  { action: 'ticket.request', name: 'Request Tickets', desc: 'Can submit a ticket request.', category: 'Ticket' },
  { action: 'ticket.create', name: 'Create Tickets', desc: 'Can create a ticket directly.', category: 'Ticket' },
  { action: 'ticket.update', name: 'Update Tickets', desc: "Can edit a ticket's details.", category: 'Ticket' },
  { action: 'ticket.remove', name: 'Remove Tickets', desc: 'Can delete a ticket.', category: 'Ticket' },
  { action: 'ticket.view.all', name: 'View All Tickets', desc: 'Can view every ticket in the organization.', category: 'Ticket' },
  { action: 'ticket.view.included', name: 'View Included Tickets', desc: 'Can only view tickets they requested or are assigned to.', category: 'Ticket' },
  { action: 'ticket.change.status', name: 'Change Ticket Status', desc: "Can change a ticket's status.", category: 'Ticket' },
  { action: 'ticket.assign', name: 'Assign Tickets', desc: 'Can assign people to work on a ticket.', category: 'Ticket' },

  { action: 'report.generate', name: 'Generate Reports', desc: 'Can generate reports.', category: 'Report' },
  { action: 'report.view', name: 'View Reports', desc: 'Can view generated reports.', category: 'Report' },
  { action: 'report.download', name: 'Download Reports', desc: 'Can download a generated report.', category: 'Report' },

  { action: 'activity.log.view.all', name: 'View All Activity', desc: 'Can view every action logged across the organization.', category: 'Activity Log' },
  { action: 'activity.log.view.included', name: 'View Included Activity', desc: "Can only view activity for tickets they're assigned to, or actions they were part of.", category: 'Activity Log' },
];

const DEFAULT_TAGS = [
  { tagName: 'Backlog', color: '#94A39D' },
  { tagName: 'To Do', color: '#64748B' },
  { tagName: 'In-Progress', color: '#3B82C4' },
  { tagName: 'Done', color: '#28A428' },
];

async function main() {
  console.log('Seeding rule categories & rules...');
  const categoryIdByName = new Map<string, number>();
  for (const name of CATEGORIES) {
    const category = await prisma.ruleCategory.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    categoryIdByName.set(name, category.id);
  }

  const ruleIdByAction = new Map<string, number>();
  for (const rule of RULES) {
    const created = await prisma.rule.upsert({
      where: { action: rule.action },
      update: { name: rule.name, desc: rule.desc, categoryId: categoryIdByName.get(rule.category)! },
      create: {
        action: rule.action,
        name: rule.name,
        desc: rule.desc,
        categoryId: categoryIdByName.get(rule.category)!,
      },
    });
    ruleIdByAction.set(rule.action, created.id);
  }

  console.log('Seeding default (global) tag templates...');
  for (const tag of DEFAULT_TAGS) {
    const existing = await prisma.tag.findFirst({
      where: { orgId: null, tagName: tag.tagName },
    });
    if (!existing) {
      await prisma.tag.create({ data: { ...tag, orgId: null, isDefault: true } });
    }
  }

  console.log('Seeding default (global) role templates...');
  const allRuleIds = [...ruleIdByAction.values()];

  async function upsertGlobalRole(
    roleName: string,
    roleDesc: string,
    actions: string[],
    isLocked = false,
  ) {
    const existing = await prisma.role.findFirst({ where: { orgId: null, roleName } });
    const ruleConnections = actions.map((action) => ({ id: ruleIdByAction.get(action)! }));

    if (existing) {
      return prisma.role.update({
        where: { id: existing.id },
        data: { roleDesc, isLocked, rules: { set: ruleConnections } },
      });
    }
    return prisma.role.create({
      data: {
        orgId: null,
        roleName,
        roleDesc,
        isDefault: true,
        isLocked,
        rules: { connect: ruleConnections },
      },
    });
  }

  await upsertGlobalRole(
    'Superadmin',
    'Full access to everything in the organization. Assigned to the owner.',
    [...ruleIdByAction.keys()],
    true,
  );
  await upsertGlobalRole('Client', "Can request tickets, and view the tickets they're included in.", [
    'ticket.request',
    'ticket.view.included',
    'activity.log.view.included',
  ]);
  await upsertGlobalRole('Member', 'Can create, edit, and work on tickets.', [
    'ticket.create',
    'ticket.update',
    'ticket.remove',
    'ticket.view.included',
    'ticket.change.status',
    'ticket.assign',
    'activity.log.view.included',
  ]);
  await upsertGlobalRole(
    'Admin',
    'Can manage members, tags, and reports, and has full visibility across all tickets.',
    [
      'ticket.create',
      'ticket.update',
      'ticket.remove',
      'ticket.view.included',
      'ticket.view.all',
      'ticket.change.status',
      'ticket.assign',
      'report.generate',
      'report.view',
      'report.download',
      'tag.view',
      'tag.add',
      'tag.update',
      'tag.remove',
      'member.invite',
      'member.remove',
      'member.view.members',
      'member.view.owner',
      'member.view.clients',
      'member.set.active',
      'activity.log.view.all',
      'activity.log.view.included',
    ],
  );

  console.log(`Done. ${categoryIdByName.size} categories, ${allRuleIds.length} rules, 4 role templates, ${DEFAULT_TAGS.length} tag templates.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
