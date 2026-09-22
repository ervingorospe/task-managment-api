/**
 * Mirrors the frontend's lib/data/permissions.ts exactly — every `action`
 * string here must match a `Rule.action` seeded in prisma/seed.ts. Kept as a
 * single source of truth so a permission check never relies on a raw string.
 */
export const PERMISSIONS = {
  // Tag Rules
  TAG_VIEW: 'tag.view',
  TAG_ADD: 'tag.add',
  TAG_UPDATE: 'tag.update',
  TAG_REMOVE: 'tag.remove',

  // Member Rules
  MEMBER_INVITE: 'member.invite',
  MEMBER_REMOVE: 'member.remove',
  MEMBER_UPDATE_ROLE: 'member.update.role',
  MEMBER_VIEW_MEMBERS: 'member.view.members',
  MEMBER_VIEW_OWNER: 'member.view.owner',
  MEMBER_VIEW_CLIENTS: 'member.view.clients',
  MEMBER_SET_ACTIVE: 'member.set.active',

  // Role Rules
  ROLE_VIEW: 'role.view',
  ROLE_ADD: 'role.add',
  ROLE_UPDATE: 'role.update',
  ROLE_REMOVE: 'role.remove',

  // Ticket Rules
  TICKET_REQUEST: 'ticket.request',
  TICKET_CREATE: 'ticket.create',
  TICKET_UPDATE: 'ticket.update',
  TICKET_REMOVE: 'ticket.remove',
  TICKET_VIEW_ALL: 'ticket.view.all',
  TICKET_VIEW_INCLUDED: 'ticket.view.included',
  TICKET_CHANGE_STATUS: 'ticket.change.status',
  TICKET_ASSIGN: 'ticket.assign',

  // Report Rules
  REPORT_GENERATE: 'report.generate',
  REPORT_VIEW: 'report.view',
  REPORT_DOWNLOAD: 'report.download',

  // Activity Rules
  ACTIVITY_LOG_VIEW_ALL: 'activity.log.view.all',
  ACTIVITY_LOG_VIEW_INCLUDED: 'activity.log.view.included',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
