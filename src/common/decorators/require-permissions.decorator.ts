import { SetMetadata } from '@nestjs/common';
import type { Permission } from '../permissions/permissions.constant';

export const PERMISSIONS_KEY = 'permissions';

/**
 * How PermissionsGuard finds the organization a request concerns.
 * List/create routes usually carry orgId directly (query or route param);
 * routes scoped by a single resource's id instead look that resource up
 * (by its route param) to find its owning org. Defaults to 'query.orgId'.
 */
export type PermissionResource =
  | 'query.orgId'
  | 'param.orgId'
  | 'param.slug'
  | 'tag.tagId'
  | 'project.projectId'
  | 'role.roleId'
  | 'member.memberId'
  | 'memberInvite.inviteId'
  | 'ticket.ticketId'
  | 'ticketComment.commentId'
  | 'ticketAttachment.attachmentId'
  | 'ticketRequest.requestId';

export interface PermissionsMetadata {
  /** Route passes if the caller has ANY one of these. Omit both anyOf and
   * allOf to only require active membership in the resolved org (no
   * specific rule) — e.g. viewing an org's own basic details. */
  anyOf?: Permission[];
  /** Route passes if the caller has ALL of these. */
  allOf?: Permission[];
  resource?: PermissionResource;
}

/**
 * Marks a route's required permission(s) for PermissionsGuard, which is
 * registered globally (see app.module.ts) — a route with no
 * `@RequirePermissions()` is unaffected by it (still just "must be logged
 * in", via JwtAuthGuard). Fully rule-based, no accountType/owner special
 * case — even org-level actions (rename, delete, transfer ownership) are
 * ordinary Rules (see permissions.constant.ts's `organization.*` entries),
 * just ones the seeded default roles only grant to Superadmin.
 *
 * @example
 *   @RequirePermissions({ allOf: [PERMISSIONS.TAG_ADD] })
 *   @RequirePermissions({ anyOf: [PERMISSIONS.TICKET_VIEW_ALL, PERMISSIONS.TICKET_VIEW_INCLUDED], resource: 'ticket.ticketId' })
 */
export const RequirePermissions = (metadata: PermissionsMetadata) =>
  SetMetadata(PERMISSIONS_KEY, metadata);
