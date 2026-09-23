/**
 * One-off: seed.ts only updates the GLOBAL role templates (Role rows with
 * orgId: null). Every existing organization's own roles were CLONED from
 * those templates at org-creation time and never stay linked afterward —
 * so the rules redesign in seed.ts never reached any already-existing
 * org's Superadmin/Admin/Member/Client rows. This reconnects each org's
 * *unmodified* default roles (isDefault: true, matched by name) to the
 * current rule set for that name. Roles an org has actually customized
 * (isDefault: false, or a custom role name) are left untouched.
 *
 * Run: npx tsx prisma/backfill-default-roles.ts
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const allRules = await prisma.rule.findMany({ select: { id: true, action: true } });
  const ruleIdByAction = new Map(allRules.map((r) => [r.action, r.id]));
  const allRuleIds = allRules.map((r) => r.id);

  const RULE_SETS: Record<string, string[] | 'ALL'> = {
    Superadmin: 'ALL',
    Client: [
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
    Member: [
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
      'organization.create',
      'activity.log.view.included',
      'report.view.own',
    ],
    Admin: [
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
  };

  const orgDefaultRoles = await prisma.role.findMany({
    where: {
      orgId: { not: null },
      isDefault: true,
      isDeleted: false,
      roleName: { in: Object.keys(RULE_SETS) },
    },
    select: { id: true, orgId: true, roleName: true },
  });

  console.log(`Found ${orgDefaultRoles.length} org-scoped default role(s) to resync.`);

  let updated = 0;
  for (const role of orgDefaultRoles) {
    const actions = RULE_SETS[role.roleName];
    const ruleIds =
      actions === 'ALL'
        ? allRuleIds
        : actions.map((action) => {
            const id = ruleIdByAction.get(action);
            if (!id) throw new Error(`Unknown rule action "${action}" — is seed.ts out of sync?`);
            return id;
          });

    await prisma.role.update({
      where: { id: role.id },
      data: { rules: { set: ruleIds.map((id) => ({ id })) } },
    });
    updated++;
  }

  console.log(`Resynced ${updated} role(s) across all existing organizations.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
