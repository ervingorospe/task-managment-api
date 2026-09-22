/**
 * Sequential per organization per prefix, 5-digit zero-padded — e.g.
 * "tckt-00001", "req-00042". `existingCount` should count every row ever
 * created for that org+prefix (soft-deleted rows included) so a deleted
 * ticket's number is never reused.
 */
export function formatReferenceId(
  prefix: 'tckt' | 'req',
  existingCount: number,
): string {
  const next = existingCount + 1;
  return `${prefix}-${String(next).padStart(5, '0')}`;
}
