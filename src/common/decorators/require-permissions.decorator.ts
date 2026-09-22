import { SetMetadata } from '@nestjs/common';
import type { Permission } from '../permissions/permissions.constant';

export const PERMISSIONS_KEY = 'permissions';

export interface PermissionsMetadata {
  /** Route passes if the caller has ANY one of these. */
  anyOf?: Permission[];
  /** Route passes if the caller has ALL of these. */
  allOf?: Permission[];
}

/**
 * Marks a route's required permission(s) for `PermissionsGuard`. Not wired
 * into any route yet — see the guard's own header comment for why, and how
 * to turn it on once auth exists.
 *
 * @example
 *   @RequirePermissions({ allOf: [PERMISSIONS.TAG_ADD] })
 *   @RequirePermissions({ anyOf: [PERMISSIONS.TICKET_VIEW_ALL, PERMISSIONS.TICKET_REQUEST] })
 */
export const RequirePermissions = (metadata: PermissionsMetadata) =>
  SetMetadata(PERMISSIONS_KEY, metadata);
