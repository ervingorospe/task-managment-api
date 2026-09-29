/**
 * Mirrors the frontend's lib/data/permissions.ts exactly — every `action`
 * string here must match a `Rule.action` seeded in prisma/seed.ts. Kept as a
 * single source of truth so a permission check never relies on a raw string.
 *
 * Fully rule-based, per-organization — there is no `accountType`/owner
 * special case anywhere in this system. A user's capabilities always come
 * from their Member row's Role in a specific org (see PermissionsGuard);
 * "owner" is still a real, structural concept (Organization.ownerId), but
 * it grants nothing on its own — the org's creator is simply assigned the
 * Superadmin role like any other member would be.
 */
export const PERMISSIONS = {
  // Organization Rules
  ORGANIZATION_CREATE: 'organization.create',
  ORGANIZATION_UPDATE_BASIC_INFO: 'organization.update.basicInfo',
  ORGANIZATION_UPDATE_LOGO: 'organization.update.logo',
  ORGANIZATION_UPDATE_TIMEZONE: 'organization.update.timezone',
  ORGANIZATION_UPDATE_INVITE_EXPIRATION:
    'organization.update.invite.expiration',
  ORGANIZATION_UPDATE_NOTIFICATIONS: 'organization.update.notifications',
  ORGANIZATION_DEACTIVATE: 'organization.deactivate',
  ORGANIZATION_DELETE: 'organization.delete',
  ORGANIZATION_CHANGE_OWNERSHIP: 'organization.change.ownership',

  // Tag Rules
  TAG_VIEW: 'tag.view',
  TAG_ADD: 'tag.add',
  TAG_UPDATE: 'tag.update',
  TAG_REMOVE: 'tag.remove',

  // Project Rules
  PROJECT_VIEW: 'project.view',
  PROJECT_VIEW_OWN: 'project.view.own',
  PROJECT_ADD: 'project.add',
  PROJECT_UPDATE: 'project.update',
  PROJECT_REMOVE: 'project.remove',

  // Member Rules
  MEMBER_INVITE: 'member.invite',
  MEMBER_REMOVE: 'member.remove',
  MEMBER_UPDATE_ROLE: 'member.update.role',
  MEMBER_VIEW_MEMBERS: 'member.view.members',
  MEMBER_VIEW_OWNER: 'member.view.owner',
  MEMBER_VIEW_CLIENT: 'member.view.client',
  MEMBER_SET_ACTIVE: 'member.set.active',

  // Role Rules
  ROLE_VIEW: 'role.view',
  ROLE_ADD: 'role.add',
  ROLE_UPDATE: 'role.update',
  ROLE_REMOVE: 'role.remove',

  // Ticket Rules
  TICKET_CREATE: 'ticket.create',
  TICKET_UPDATE: 'ticket.update',
  TICKET_REMOVE: 'ticket.remove',
  TICKET_VIEW_ALL: 'ticket.view.all',
  TICKET_VIEW_INCLUDED: 'ticket.view.included',
  TICKET_CHANGE_TAG: 'ticket.change.tag',
  TICKET_ASSIGN: 'ticket.assign',
  TICKET_ASSIGN_VIEW: 'ticket.assign.view',
  TICKET_COMMENT: 'ticket.comment',
  TICKET_EDIT_COMMENT: 'ticket.edit.comment',
  TICKET_REMOVE_COMMENT: 'ticket.remove.comment',

  // Request Rules
  REQUEST_ALL_CREATE: 'request.all.create',
  REQUEST_ALL_CANCEL: 'request.all.cancel',
  REQUEST_ALL_APPROVE: 'request.all.approve',
  REQUEST_ALL_REJECT: 'request.all.reject',
  REQUEST_ALL_UPDATE: 'request.all.update',
  REQUEST_OWN_CREATE: 'request.own.create',
  REQUEST_OWN_CANCEL: 'request.own.cancel',
  REQUEST_OWN_UPDATE: 'request.own.update',

  // Report Rules
  REPORT_DOWNLOAD: 'report.download',
  REPORT_VIEW_ALL: 'report.view.all',
  REPORT_VIEW_OWN: 'report.view.own',

  // Activity Rules
  ACTIVITY_LOG_VIEW_ALL: 'activity.log.view.all',
  ACTIVITY_LOG_VIEW_INCLUDED: 'activity.log.view.included',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
