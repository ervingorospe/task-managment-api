import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

// Mirrors the frontend's lib/data/rules-category.ts + default-rules.ts +
// default-roles.ts. Fully rule-based, per-organization — there's no
// accountType/owner special case anywhere; the org's creator is simply
// assigned the Superadmin role like any other member would be.
const CATEGORIES = [
  'Organization',
  'Tag',
  'Project',
  'Member',
  'Role',
  'Ticket',
  'Request',
  'Report',
  'Activity Log',
] as const;

const RULES: {
  action: string;
  name: string;
  desc: string;
  category: (typeof CATEGORIES)[number];
}[] = [
  {
    action: 'organization.create',
    name: 'Create Organization',
    desc: 'Can create a new organization.',
    category: 'Organization',
  },
  {
    action: 'organization.update.basicInfo',
    name: 'Update Basic Info',
    desc: "Can edit the organization's name, description, email, and website.",
    category: 'Organization',
  },
  {
    action: 'organization.update.logo',
    name: 'Update Logo',
    desc: "Can change the organization's logo.",
    category: 'Organization',
  },
  {
    action: 'organization.update.timezone',
    name: 'Update Timezone',
    desc: "Can change the organization's timezone.",
    category: 'Organization',
  },
  {
    action: 'organization.update.invite.expiration',
    name: 'Update Invite Expiration',
    desc: 'Can change how long member invites stay valid.',
    category: 'Organization',
  },
  {
    action: 'organization.update.notifications',
    name: 'Update Notifications',
    desc: "Can change the organization's email notification settings.",
    category: 'Organization',
  },
  {
    action: 'organization.deactivate',
    name: 'Deactivate Organization',
    desc: 'Can deactivate or reactivate the organization.',
    category: 'Organization',
  },
  {
    action: 'organization.delete',
    name: 'Delete Organization',
    desc: 'Can permanently delete the organization.',
    category: 'Organization',
  },
  {
    action: 'organization.change.ownership',
    name: 'Transfer Ownership',
    desc: 'Can transfer ownership of the organization to someone else.',
    category: 'Organization',
  },

  {
    action: 'tag.view',
    name: 'View Tags',
    desc: 'Can view the tags available in the organization.',
    category: 'Tag',
  },
  {
    action: 'tag.add',
    name: 'Add Tags',
    desc: 'Can create new tags for the organization.',
    category: 'Tag',
  },
  {
    action: 'tag.update',
    name: 'Update Tags',
    desc: "Can edit a tag's name or color.",
    category: 'Tag',
  },
  {
    action: 'tag.remove',
    name: 'Remove Tags',
    desc: 'Can delete a tag from the organization.',
    category: 'Tag',
  },

  {
    action: 'project.view',
    name: 'View All Projects',
    desc: 'Can view every project in the organization.',
    category: 'Project',
  },
  {
    action: 'project.view.own',
    name: 'View Assigned Projects',
    desc: 'Can only view projects they are assigned to.',
    category: 'Project',
  },
  {
    action: 'project.add',
    name: 'Add Projects',
    desc: 'Can create a new project for the organization.',
    category: 'Project',
  },
  {
    action: 'project.update',
    name: 'Update Projects',
    desc: "Can edit a project's name or description.",
    category: 'Project',
  },
  {
    action: 'project.remove',
    name: 'Remove Projects',
    desc: 'Can delete a project from the organization.',
    category: 'Project',
  },

  {
    action: 'member.invite',
    name: 'Invite Members',
    desc: 'Can invite new people, and resend or cancel pending invitations.',
    category: 'Member',
  },
  {
    action: 'member.remove',
    name: 'Remove Members',
    desc: 'Can remove a member from the organization.',
    category: 'Member',
  },
  {
    action: 'member.update.role',
    name: "Update Member's Role",
    desc: "Can change a member's role.",
    category: 'Member',
  },
  {
    action: 'member.view.members',
    name: 'View Members',
    desc: 'Can view the list of members in the organization.',
    category: 'Member',
  },
  {
    action: 'member.view.owner',
    name: 'View Owner',
    desc: "Can view the organization's owner.",
    category: 'Member',
  },
  {
    action: 'member.view.client',
    name: 'View Clients',
    desc: 'Can view members who hold the Client role.',
    category: 'Member',
  },
  {
    action: 'member.set.active',
    name: 'Activate/Deactivate Members',
    desc: "Can activate or deactivate a member's access.",
    category: 'Member',
  },

  {
    action: 'role.view',
    name: 'View Roles',
    desc: 'Can view the roles defined in the organization.',
    category: 'Role',
  },
  {
    action: 'role.add',
    name: 'Add Roles',
    desc: 'Can create a new role.',
    category: 'Role',
  },
  {
    action: 'role.update',
    name: 'Update Roles',
    desc: "Can edit a role's name, description, or permissions.",
    category: 'Role',
  },
  {
    action: 'role.remove',
    name: 'Remove Roles',
    desc: 'Can delete a role. Members holding it are reassigned to the default Member role.',
    category: 'Role',
  },

  {
    action: 'ticket.create',
    name: 'Create Tickets',
    desc: 'Can create a ticket directly.',
    category: 'Ticket',
  },
  {
    action: 'ticket.update',
    name: 'Update Tickets',
    desc: "Can update a ticket's title, description, and attachments.",
    category: 'Ticket',
  },
  {
    action: 'ticket.remove',
    name: 'Remove Tickets',
    desc: 'Can delete a ticket.',
    category: 'Ticket',
  },
  {
    action: 'ticket.view.all',
    name: 'View All Tickets',
    desc: 'Can view every ticket in the organization.',
    category: 'Ticket',
  },
  {
    action: 'ticket.view.included',
    name: 'View Included Tickets',
    desc: 'Can only view tickets they requested or are assigned to.',
    category: 'Ticket',
  },
  {
    action: 'ticket.change.tag',
    name: 'Change Ticket Tag',
    desc: "Can change a ticket's tag (including its status).",
    category: 'Ticket',
  },
  {
    action: 'ticket.assign',
    name: 'Assign Tickets',
    desc: 'Can assign or reassign members to a ticket.',
    category: 'Ticket',
  },
  {
    action: 'ticket.assign.view',
    name: 'View Ticket Assignees',
    desc: "Can see who's assigned to a ticket, without being able to change it.",
    category: 'Ticket',
  },
  {
    action: 'ticket.comment',
    name: 'Comment on Tickets',
    desc: 'Can post a comment on a ticket.',
    category: 'Ticket',
  },
  {
    action: 'ticket.edit.comment',
    name: 'Edit Own Comments',
    desc: "Can edit their own comments on a ticket — never someone else's, regardless of role.",
    category: 'Ticket',
  },
  {
    action: 'ticket.remove.comment',
    name: 'Remove Own Comments',
    desc: "Can remove their own comments on a ticket — never someone else's, regardless of role.",
    category: 'Ticket',
  },

  {
    action: 'request.all.create',
    name: 'Create Any Request',
    desc: 'Can create a ticket request on behalf of any client.',
    category: 'Request',
  },
  {
    action: 'request.all.cancel',
    name: 'Cancel Any Request',
    desc: 'Can cancel any pending request.',
    category: 'Request',
  },
  {
    action: 'request.all.approve',
    name: 'Approve Requests',
    desc: 'Can approve a pending request, turning it into a ticket.',
    category: 'Request',
  },
  {
    action: 'request.all.reject',
    name: 'Reject Requests',
    desc: 'Can reject a pending request.',
    category: 'Request',
  },
  {
    action: 'request.all.update',
    name: 'Update Any Request',
    desc: "Can edit any request's details.",
    category: 'Request',
  },
  {
    action: 'request.own.create',
    name: 'Create Own Request',
    desc: 'Can submit a ticket request.',
    category: 'Request',
  },
  {
    action: 'request.own.cancel',
    name: 'Cancel Own Request',
    desc: 'Can cancel a request they submitted.',
    category: 'Request',
  },
  {
    action: 'request.own.update',
    name: 'Update Own Request',
    desc: "Can edit a request they submitted, before it's reviewed.",
    category: 'Request',
  },

  {
    action: 'report.download',
    name: 'Download Reports',
    desc: 'Can download a generated report.',
    category: 'Report',
  },
  {
    action: 'report.view.all',
    name: 'View All Reports',
    desc: 'Can view reports covering every ticket and request in the organization.',
    category: 'Report',
  },
  {
    action: 'report.view.own',
    name: 'View Own Reports',
    desc: 'Can only view reports for tickets and requests they created or are assigned to.',
    category: 'Report',
  },

  {
    action: 'activity.log.view.all',
    name: 'View All Activity',
    desc: 'Can view every action logged across the organization.',
    category: 'Activity Log',
  },
  {
    action: 'activity.log.view.included',
    name: 'View Included Activity',
    desc: "Can only view activity for tickets they're assigned to, or actions they were part of.",
    category: 'Activity Log',
  },
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
      update: {
        name: rule.name,
        desc: rule.desc,
        categoryId: categoryIdByName.get(rule.category)!,
      },
      create: {
        action: rule.action,
        name: rule.name,
        desc: rule.desc,
        categoryId: categoryIdByName.get(rule.category)!,
      },
    });
    ruleIdByAction.set(rule.action, created.id);
  }

  // Rules renamed or dropped in a redesign (e.g. ticket.request replaced by
  // the request.* group, member.view.clients renamed to member.view.client,
  // report.generate removed as redundant with report.download) would
  // otherwise linger as orphaned rows forever, since upsert only adds/
  // updates what's still in RULES above. Sweep anything no longer present.
  const validActions = new Set(RULES.map((r) => r.action));
  const existingRules = await prisma.rule.findMany({
    select: { id: true, action: true },
  });
  const obsolete = existingRules.filter((r) => !validActions.has(r.action));
  if (obsolete.length) {
    console.log(
      `Removing ${obsolete.length} obsolete rule(s): ${obsolete.map((r) => r.action).join(', ')}`,
    );
    await prisma.rule.deleteMany({
      where: { id: { in: obsolete.map((r) => r.id) } },
    });
  }

  console.log('Seeding default (global) tag templates...');
  for (const tag of DEFAULT_TAGS) {
    const existing = await prisma.tag.findFirst({
      where: { orgId: null, tagName: tag.tagName },
    });
    if (!existing) {
      await prisma.tag.create({
        data: { ...tag, orgId: null, isDefault: true },
      });
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
    const existing = await prisma.role.findFirst({
      where: { orgId: null, roleName },
    });
    const ruleConnections = actions.map((action) => ({
      id: ruleIdByAction.get(action)!,
    }));

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

  await upsertGlobalRole(
    'Client',
    "Can request tickets, and view the tickets they're included in.",
    [
      'request.own.create',
      'request.own.cancel',
      'request.own.update',
      'ticket.assign.view',
      'ticket.view.included',
      'ticket.comment',
      'ticket.edit.comment',
      'ticket.remove.comment',
      'organization.create',
      'activity.log.view.included',
      'report.view.own',
    ],
  );

  await upsertGlobalRole('Member', 'Can create, edit, and work on tickets.', [
    'request.own.create',
    'request.own.cancel',
    'request.own.update',
    'member.view.members',
    'member.view.client',
    'ticket.assign.view',
    'ticket.change.tag',
    'ticket.view.included',
    'ticket.update',
    'ticket.create',
    'ticket.comment',
    'ticket.edit.comment',
    'ticket.remove.comment',
    'project.view.own',
    'organization.create',
    'activity.log.view.included',
    'report.view.own',
  ]);

  await upsertGlobalRole(
    'Admin',
    'Can manage members, tags, projects, and reports, and has full visibility across all tickets.',
    [
      'request.all.create',
      'request.all.cancel',
      'request.all.approve',
      'request.all.reject',
      'request.all.update',
      'request.own.create',
      'request.own.cancel',
      'request.own.update',
      'tag.view',
      'tag.add',
      'tag.update',
      'tag.remove',
      'project.view',
      'project.add',
      'project.update',
      'project.remove',
      'member.view.client',
      'member.set.active',
      'member.view.owner',
      'member.view.members',
      'member.remove',
      'member.invite',
      'role.view',
      'ticket.assign.view',
      'ticket.assign',
      'ticket.change.tag',
      'ticket.view.included',
      'ticket.view.all',
      'ticket.remove',
      'ticket.update',
      'ticket.create',
      'ticket.comment',
      'ticket.edit.comment',
      'ticket.remove.comment',
      'organization.create',
      'activity.log.view.included',
      'activity.log.view.all',
      'report.download',
      'report.view.all',
      'report.view.own',
    ],
  );

  console.log(
    `Done. ${categoryIdByName.size} categories, ${allRuleIds.length} rules, 4 role templates, ${DEFAULT_TAGS.length} tag templates.`,
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
